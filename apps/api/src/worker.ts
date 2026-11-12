// Entrada del Worker (design.md D2): NestJS se inicializa una sola vez por
// instancia, en el ámbito global del módulo (sin E/S, que Workers no permite
// fuera de un handler), y se expone con httpServerHandler de cloudflare:node.
import 'reflect-metadata';
import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { HttpException, type INestApplication } from '@nestjs/common';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import express from 'express';
import { crearApp } from './app';
import { enPeticion, precalentarPrisma } from './datos/prisma';
import { despachar, tareasPorDefecto } from './programadas/despacho';
import { limpiarSesiones } from './programadas/limpieza-sesiones';
import { borrarSesionesCaducadas } from './programadas/limpieza-sesiones.bd';
import {
  ConfirmacionService,
  type DatosPago,
  type OrdenConfirmada,
} from './reservas/confirmacion.service';
import { ReconciliacionService } from './reservas/reconciliacion.service';
import { ReservasService } from './reservas/reservas.service';

export { Inventario } from './reservas/inventario';
export { Limites } from './auth/limites';

// El puerto solo es una clave de enrutamiento interna, no un puerto de red.
const PUERTO = 8080;

const expressApp = express();
let lista: Promise<INestApplication> | undefined;

function asegurarApp(): Promise<INestApplication> {
  lista ??= crearApp(expressApp, { origenFrontend: env.FRONTEND_ORIGIN }).catch((error) => {
    lista = undefined; // reintentar en la siguiente petición
    throw error;
  });
  return lista;
}

const servidor = createServer((req, res) => {
  asegurarApp().then(
    () => expressApp(req, res),
    (error: unknown) => {
      console.error(
        JSON.stringify({
          nivel: 'error',
          mensaje: 'fallo al iniciar la API',
          error: String(error),
        }),
      );
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ codigo: 'ERROR_INTERNO', mensaje: 'La API no pudo iniciarse.' }));
    },
  );
});
servidor.listen(PUERTO);

const http = httpServerHandler({ port: PUERTO });
const fetchHttp = http.fetch;
if (!fetchHttp) throw new Error('httpServerHandler no devolvió un handler fetch');

// Prueba 1 (opción a): NestJS se inicializa al cargar el módulo. Esa CPU cuenta como
// tiempo de arranque del isolate y no como CPU de la primera petición. La
// inicialización no hace E/S (Postgres y el almacén se conectan al usarse). Si falla,
// asegurarApp() la reintenta de forma perezosa en la primera petición.
try {
  await asegurarApp();
  // Lo mismo para Prisma: WASM y esquema listos antes de la primera consulta.
  await precalentarPrisma();
} catch (error) {
  console.error(
    JSON.stringify({
      nivel: 'error',
      mensaje: 'fallo al iniciar la API en el arranque; se reintenta en la primera petición',
      error: String(error),
    }),
  );
}

/** Una tarea que falla queda registrada y no rompe el handler scheduled. */
const segura = (tarea: string, fn: () => Promise<void>) => async (): Promise<void> => {
  try {
    await fn();
  } catch (error) {
    console.error(
      JSON.stringify({ nivel: 'error', mensaje: 'falló la tarea', tarea, error: String(error) }),
    );
  }
};

/** Registro estructurado del resultado de una tarea programada. */
const registrar = (tarea: string, datos: Record<string, unknown>) =>
  console.log(JSON.stringify({ nivel: 'info', mensaje: 'resultado de tarea', tarea, ...datos }));

const tareasProduccion = {
  ...tareasPorDefecto,
  // Sprint 3: expiración de reservas vencidas (cada minuto) y reconciliación (cada 5 min).
  expirar: segura('expirar', async () => {
    const app = await asegurarApp();
    registrar('expirar', { expiradas: await app.get(ReservasService).expirar() });
  }),
  reconciliar: segura('reconciliar', async () => {
    const app = await asegurarApp();
    const corregidos = await app.get(ReconciliacionService).reconciliar();
    registrar('reconciliar', { corregidos: corregidos.length });
  }),
  limpiarSesiones: async () => void (await limpiarSesiones(borrarSesionesCaducadas)),
};

/**
 * Entrada del Worker. Clase WorkerEntrypoint: además de fetch y scheduled expone por RPC
 * (solo alcanzable por service bindings, nunca por HTTP) la confirmación de reservas,
 * que el pago del Sprint 4 usará por dentro (design D5 del Sprint 3).
 */
export default class Api extends WorkerEntrypoint<Env> {
  // Una conexión a Postgres por petición HTTP; se cierra con waitUntil tras responder.
  override fetch(request: Request): Promise<Response> {
    return enPeticion(
      async () =>
        fetchHttp!(request as Request<unknown, IncomingRequestCfProperties>, this.env, this.ctx),
      (cierre) => this.ctx.waitUntil(cierre),
    );
  }

  override async scheduled(controller: ScheduledController): Promise<void> {
    this.ctx.waitUntil(despachar(controller.cron, tareasProduccion).then(() => undefined));
  }

  async confirmar(
    usuarioId: string,
    reservaId: string,
    clave: string,
    pago?: DatosPago,
  ): Promise<OrdenConfirmada> {
    const app = await asegurarApp();
    try {
      return await enPeticion(() =>
        app.get(ConfirmacionService).confirmar(usuarioId, reservaId, clave, pago),
      );
    } catch (error) {
      // Por RPC solo viaja el mensaje: se envía el { codigo, mensaje } de la excepción.
      if (error instanceof HttpException) {
        throw new Error(JSON.stringify(error.getResponse()), { cause: error });
      }
      throw error;
    }
  }
}
