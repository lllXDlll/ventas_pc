// TEMPORAL (Sprint 0): pruebas de los endpoints de las pruebas 5, 6 y 7. Se elimina en la tarea 8.1.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import worker from '../src/worker';

type FetchWorker = NonNullable<ExportedHandler<Env>['fetch']>;
const fetchWorker = worker.fetch as FetchWorker;

async function pedir(ruta: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const peticion = new Request(`https://api.test${ruta}`, init) as Parameters<FetchWorker>[0];
  const res = await fetchWorker(peticion, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('endpoints temporales de las pruebas de plataforma', () => {
  it('POST /__prueba/cookie emite una cookie httpOnly y SameSite=Lax', async () => {
    const res = await pedir('/__prueba/cookie', { method: 'POST' });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^xd_prueba=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('GET /__prueba/cookie devuelve la cookie recibida', async () => {
    const res = await pedir('/__prueba/cookie', { headers: { Cookie: 'otra=1; xd_prueba=abc' } });
    expect(await res.json()).toEqual({ recibida: 'abc' });
  });

  it('GET /__prueba/ip devuelve CF-Connecting-IP', async () => {
    const res = await pedir('/__prueba/ip', { headers: { 'CF-Connecting-IP': '203.0.113.7' } });
    const cuerpo = (await res.json()) as { cfConnectingIp: string };
    expect(cuerpo.cfConnectingIp).toBe('203.0.113.7');
  });

  it('GET /__prueba/pbkdf2 sin token responde 404', async () => {
    const res = await pedir('/__prueba/pbkdf2?iteraciones=1000');
    expect(res.status).toBe(404);
  });
});
