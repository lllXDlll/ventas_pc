import { join } from 'node:path';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC genera la metadata de decoradores que NestJS necesita (esbuild no lo hace).
const decoradores = () =>
  swc.vite({
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
      target: 'es2022',
    },
  });

const moduloVacio = join(import.meta.dirname, 'src/comun/modulo-vacio.ts');

export default defineConfig({
  test: {
    projects: [
      {
        // Lógica pura, en Node.
        plugins: [decoradores()],
        test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        // Extremo a extremo dentro del runtime de Workers (workerd), sin base de datos.
        // Lo que toca Postgres va en "integracion": el cargador CommonJS de este plugin
        // no aplica la condición "workerd" al require('pg-cloudflare') de `pg`.
        plugins: [
          decoradores(),
          cloudflareTest({
            main: './src/worker.ts',
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              bindings: {
                FRONTEND_ORIGIN: 'http://localhost:3000',
                COOKIE_DOMAIN: '',
              },
            },
          }),
        ],
        resolve: {
          alias: {
            '@nestjs/microservices/microservices-module.js': moduloVacio,
            '@nestjs/websockets/socket-module.js': moduloVacio,
            '@nestjs/microservices': moduloVacio,
          },
        },
        test: { name: 'workers', include: ['test/**/*.e2e.test.ts'] },
      },
      {
        // Integración: Postgres real (Docker en local, servicio en CI) y el Worker
        // empaquetado como en producción (createTestHarness de Wrangler).
        test: {
          name: 'integracion',
          include: ['test/**/*.int.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
