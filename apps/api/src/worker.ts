// Entrada del Worker (design.md D2): NestJS se inicializa una sola vez por
// instancia, en el ámbito global del módulo (sin E/S, que Workers no permite
// fuera de un handler), y se expone con httpServerHandler de cloudflare:node.
import 'reflect-metadata';
import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import express from 'express';
import { crearApp } from './app';
import { enPeticion, precalentarPrisma } from './datos/prisma';
import { despachar } from './programadas/despacho';

export { Inventario } from './reservas/inventario';
export { Limites } from './auth/limites';

// El puerto solo es una clave de enrutamiento interna, no un puerto de red.
const PUERTO = 8080;

const expressApp = express();
let lista: Promise<void> | undefined;

function asegurarApp(): Promise<void> {
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

export default {
  // Una conexión a Postgres por petición HTTP; se cierra con waitUntil tras responder.
  fetch: (request, env, ctx) =>
    enPeticion(
      async () => fetchHttp(request, env, ctx),
      (cierre) => ctx.waitUntil(cierre),
    ),
  async scheduled(controller, _env, ctx) {
    ctx.waitUntil(despachar(controller.cron).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
