// GET /health/ready contra el Worker empaquetado como en producción (Wrangler),
// con Hyperdrive apuntando al Postgres local (localConnectionString).
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';

const URL_BD = process.env.DIRECT_URL ?? 'postgresql://xdtech:xdtech@localhost:5432/xdtech';

/** Conexiones abiertas en la base, sin contar la de quien consulta. */
async function conexionesAbiertas(): Promise<number> {
  const cliente = new pg.Client({ connectionString: URL_BD });
  await cliente.connect();
  try {
    const { rows } = await cliente.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity
        WHERE datname = current_database() AND backend_type = 'client backend'
          AND pid <> pg_backend_pid()`,
    );
    return Number(rows[0]?.n ?? 0);
  } finally {
    await cliente.end();
  }
}

/** Espera hasta `ms` a que la condición se cumpla (los cierres van por waitUntil). */
async function esperar(condicion: () => Promise<boolean>, ms = 5000): Promise<boolean> {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (await condicion()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return condicion();
}

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

  // Un solo PrismaClient por isolate con una conexión por petición (src/datos/prisma.ts):
  // si dos peticiones compartieran un socket, workerd lo rechazaría y ready daría 503.
  it('peticiones concurrentes y seguidas no comparten conexión ni dejan conexiones abiertas', async () => {
    const antes = await conexionesAbiertas();
    for (let ronda = 0; ronda < 3; ronda++) {
      const respuestas = await Promise.all(
        Array.from({ length: 20 }, () => servidor.fetch('/health/ready')),
      );
      expect(respuestas.map((r) => r.status)).toEqual(Array(20).fill(200));
    }
    // Ninguna conexión sobrevive a su petición. Nota: workerd cierra los sockets al terminar
    // la invocación aunque la API no los cierre (comprobado con una mutación en el Sprint 1),
    // así que esto protege la base, no el cierre explícito de enPeticion().
    expect(await esperar(async () => (await conexionesAbiertas()) <= antes)).toBe(true);
  });

  it('GET /health/live responde 200', async () => {
    const res = await servidor.fetch('/health/live');
    expect(res.status).toBe(200);
  });
});
