// Limpieza diaria de sesiones (spec tareas-programadas) disparando el cron real del Worker
// empaquetado contra el Postgres local.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import { URL_LOCAL } from '../scripts/semillas.ts';

const bd = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const servidor = createTestHarness({
  root: join(import.meta.dirname, '..'),
  workers: [{ configPath: './wrangler.jsonc' }],
});
let usuarioId = '';

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  usuarioId = randomUUID();
  await bd.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en)
     VALUES ($1, $2, 'pbkdf2$1$a$b', now())`,
    [usuarioId, `cron-${usuarioId}@prueba.local`],
  );
});
afterAll(async () => {
  await bd.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  await servidor.close();
  await bd.end();
});

async function sesion(nombre: string, venceEn: string, revocadaEn: string | null): Promise<void> {
  await bd.query(
    `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en, revocada, revocada_en)
     VALUES ($1, $2, $3, now() + $4::interval, $5, now() + $6::interval)`,
    [
      randomUUID(),
      `${nombre}-${randomUUID()}`,
      usuarioId,
      venceEn,
      revocadaEn !== null,
      revocadaEn,
    ],
  );
}

describe('cron de limpieza de sesiones', () => {
  it('borra la vencida y la revocada hace dos días; conserva la revocada hace una hora y la válida', async () => {
    await sesion('vencida', '-1 hour', null);
    await sesion('revocada-vieja', '5 days', '-2 days');
    await sesion('revocada-reciente', '5 days', '-1 hour');
    await sesion('valida', '5 days', null);

    const resultado = await servidor.getWorker().scheduled({ cron: '0 4 * * *' });
    expect(resultado.outcome).toBe('ok');

    const { rows } = await bd.query<{ token_hash: string }>(
      'SELECT token_hash FROM sesiones WHERE usuario_id = $1',
      [usuarioId],
    );
    const quedan = rows.map((r) => r.token_hash.split('-').slice(0, -5).join('-')).sort();
    expect(quedan).toEqual(['revocada-reciente', 'valida']);
  });

  it('los otros horarios no borran sesiones', async () => {
    await sesion('vencida-2', '-1 hour', null);
    for (const cron of ['* * * * *', '*/5 * * * *']) {
      expect((await servidor.getWorker().scheduled({ cron })).outcome).toBe('ok');
    }
    const { rows } = await bd.query(
      `SELECT 1 FROM sesiones WHERE usuario_id = $1 AND token_hash LIKE 'vencida-2-%'`,
      [usuarioId],
    );
    expect(rows).toHaveLength(1);
  });
});
