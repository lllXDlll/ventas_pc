// Ninguna ruta /admin puede quedar sin el rol ADMIN (spec autorizacion-roles, design D7):
// se recorren todas las rutas que NestJS registró, no una lista escrita a mano.
// El 403 con rol CLIENTE se prueba con sesión real en test/catalogo.int.test.ts.
import { NestFactory, ModulesContainer } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import express from 'express';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import worker from '../src/worker';

interface Ruta {
  metodo: string;
  ruta: string;
  roles: string[] | undefined;
}

const unir = (...partes: (string | undefined)[]) =>
  '/' +
  partes
    .flatMap((p) => (p ?? '').split('/'))
    .filter(Boolean)
    .join('/');

const rutas: Ruta[] = [];

beforeAll(async () => {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(express()), { logger: false });
  for (const modulo of app.get(ModulesContainer).values()) {
    for (const { metatype } of modulo.controllers.values()) {
      if (!metatype) continue;
      const base = Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined;
      const prototipo = (metatype as { prototype: Record<string, unknown> }).prototype;
      for (const nombre of Object.getOwnPropertyNames(prototipo)) {
        const handler = prototipo[nombre];
        if (nombre === 'constructor' || typeof handler !== 'function') continue;
        const ruta = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const metodo = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (ruta === undefined || metodo === undefined) continue;
        const roles = (Reflect.getMetadata('auth:roles', handler) ??
          Reflect.getMetadata('auth:roles', metatype)) as string[] | undefined;
        rutas.push({ metodo: RequestMethod[metodo], ruta: unir(base, ruta), roles });
      }
    }
  }
  await app.close();
});

type FetchWorker = NonNullable<ExportedHandler<Env>['fetch']>;
async function pedir(metodo: string, ruta: string) {
  const ctx = createExecutionContext();
  const url = `https://api.test${ruta.replace(/:[A-Za-z]+/g, '00000000-0000-7000-8000-000000000000')}`;
  const fetchWorker: FetchWorker = (req, e, c) => new worker(c, e).fetch(req);
  const res = await fetchWorker(
    new Request(url, {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: metodo === 'GET' ? undefined : '{}',
    }) as Parameters<FetchWorker>[0],
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe('rutas /admin', () => {
  it('existen rutas administrativas registradas', () => {
    expect(rutas.filter((r) => r.ruta.startsWith('/admin')).length).toBeGreaterThan(0);
    // Reglas y reportes del Sprint 6 (tarea 2.5): también entran en el recorrido.
    expect(rutas.map((r) => `${r.metodo} ${r.ruta}`)).toEqual(
      expect.arrayContaining([
        'GET /admin/reglas',
        'PATCH /admin/reglas/:codigo',
        'GET /admin/reportes/ventas',
        'GET /admin/reportes/asistente',
      ]),
    );
  });

  it('todas exigen el rol ADMIN', () => {
    const abiertas = rutas.filter(
      (r) => r.ruta.startsWith('/admin') && !r.roles?.includes('ADMIN'),
    );
    expect(abiertas).toEqual([]);
  });

  it('todas responden 401 sin sesión', async () => {
    for (const r of rutas.filter((x) => x.ruta.startsWith('/admin'))) {
      const res = await pedir(r.metodo, r.ruta);
      expect(res.status, `${r.metodo} ${r.ruta}`).toBe(401);
    }
  });
});
