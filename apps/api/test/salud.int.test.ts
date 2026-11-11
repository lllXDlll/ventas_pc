// GET /health/ready contra el Worker empaquetado como en producción (Wrangler),
// con Hyperdrive apuntando al Postgres local (localConnectionString).
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';

const servidor = createTestHarness({
  root: join(import.meta.dirname, '..'),
  workers: [{ configPath: './wrangler.jsonc', vars: { FRONTEND_ORIGIN: 'http://localhost:3000' } }],
});

beforeAll(async () => {
  await servidor.listen();
});

afterAll(async () => {
  await servidor.close();
});

describe('salud con dependencias reales', () => {
  it('GET /health/ready responde 200 con Postgres y el almacén activos', async () => {
    const res = await servidor.fetch('/health/ready');
    expect(await res.json()).toEqual({
      estado: 'ok',
      dependencias: { postgres: 'ok', almacen: 'ok' },
    });
    expect(res.status).toBe(200);
  });

  it('GET /health/live responde 200', async () => {
    const res = await servidor.fetch('/health/live');
    expect(res.status).toBe(200);
  });
});
