// Entrada del Worker (design.md D2): NestJS se inicializa una sola vez por
// instancia, de forma perezosa en la primera petición (Workers no permite E/S
// fuera de un handler), y se expone con httpServerHandler de cloudflare:node.
import 'reflect-metadata';
import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import express from 'express';
import { crearApp } from './app';
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

export default {
  fetch: http.fetch,
  async scheduled(controller, _env, ctx) {
    ctx.waitUntil(despachar(controller.cron).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
