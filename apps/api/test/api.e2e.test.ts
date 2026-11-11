import {
  createScheduledController,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import worker from '../src/worker';

const ORIGEN_FRONTEND = 'http://localhost:3000';

type FetchWorker = NonNullable<ExportedHandler<Env>['fetch']>;
const fetchWorker = worker.fetch as FetchWorker;

async function pedir(ruta: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const peticion = new Request(`https://api.test${ruta}`, init) as Parameters<FetchWorker>[0];
  const res = await fetchWorker(peticion, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('API en el runtime de Workers', () => {
  it('GET /health/live responde 200', async () => {
    const res = await pedir('/health/live');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: 'ok' });
  });

  it('una ruta inexistente responde 404 con { codigo, mensaje }', async () => {
    const res = await pedir('/no-existe');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      codigo: 'NO_ENCONTRADO',
      mensaje: 'El recurso solicitado no existe.',
    });
  });

  it('no expone la cabecera X-Powered-By', async () => {
    const res = await pedir('/health/live');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('CORS', () => {
  it('permite credenciales solo al origen del frontend', async () => {
    const res = await pedir('/health/live', { headers: { Origin: ORIGEN_FRONTEND } });
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGEN_FRONTEND);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('un origen ajeno no recibe Access-Control-Allow-Origin', async () => {
    const res = await pedir('/health/live', { headers: { Origin: 'https://ajeno.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('el preflight de un origen ajeno no autoriza nada', async () => {
    const res = await pedir('/health/live', {
      method: 'OPTIONS',
      headers: { Origin: 'https://ajeno.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('handler scheduled', () => {
  it('despacha el cron de cada minuto a la tarea de expiración', async () => {
    const log = vi.spyOn(console, 'log');
    const controller = createScheduledController({ scheduledTime: Date.now(), cron: '* * * * *' });
    const ctx = createExecutionContext();

    await worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('"tarea":"expirar"'));
    log.mockRestore();
  });
});
