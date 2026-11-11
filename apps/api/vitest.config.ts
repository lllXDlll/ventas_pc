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
        // Extremo a extremo dentro del runtime de Workers (workerd).
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
        // Integración contra Postgres real (Docker en local, servicio en CI).
        plugins: [decoradores()],
        test: {
          name: 'integracion',
          include: ['test/**/*.int.test.ts'],
          environment: 'node',
          fileParallelism: false,
        },
      },
    ],
  },
});
