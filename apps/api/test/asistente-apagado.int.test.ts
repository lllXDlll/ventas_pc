// Interruptor de la IA (spec asistente, "Interruptor de la IA"; tarea 3.5 del Sprint 5): con
// IA_HABILITADA distinto de "true" todo sale del respaldo y no se llama al proveedor.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import {
  semillaCatalogo,
  semillaCategorias,
  semillaReglas,
  URL_LOCAL,
} from '../scripts/semillas.ts';

const bd = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const servidor = createTestHarness({
  root: join(import.meta.dirname, '..'),
  workers: [
    {
      configPath: './wrangler.jsonc',
      // El escenario "caida" demostraría una llamada: con la IA apagada no debe ocurrir.
      vars: { COOKIE_DOMAIN: '', IA_PROVEEDOR: 'simulado', IA_HABILITADA: 'false' },
    },
  ],
});
let usuario = '';

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  await semillaCategorias(bd);
  await semillaReglas(bd);
  await semillaCatalogo(bd);
});

afterAll(async () => {
  if (usuario) await bd.query('DELETE FROM usuarios WHERE id = $1', [usuario]);
  await servidor.close();
  await bd.end();
});

it('IA apagada: respaldo válido, ningún intento, motivo IA_DESACTIVADA y la consulta cuenta', async () => {
  usuario = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await bd.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en) VALUES ($1, $2, 'x', now())`,
    [usuario, `asistente-off-${usuario}@prueba.local`],
  );
  await bd.query(
    `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en) VALUES ($1, $2, $3, now() + interval '1 day')`,
    [randomUUID(), createHash('sha256').update(token).digest('hex'), usuario],
  );
  const res = await servidor.fetch('/asistente/recomendar', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `xd_sesion=${token}`,
      'x-ia-simulado': 'caida',
    },
    body: JSON.stringify({ presupuesto: 4000, uso: 'ESTUDIO' }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const r = (await res.json()) as {
    respaldo: boolean;
    configuracion: { estado: string; origen: string };
    consultas: { usadas: number };
  };
  expect(r.respaldo).toBe(true);
  expect(r.configuracion).toMatchObject({ estado: 'VALIDA', origen: 'IA' });
  expect(r.consultas.usadas).toBe(1);
  const { rows } = await bd.query(
    'SELECT uso_respaldo, resultado FROM uso_asistente WHERE usuario_id = $1',
    [usuario],
  );
  expect(rows[0]).toMatchObject({
    uso_respaldo: true,
    resultado: { intentos: 0, motivo: 'IA_DESACTIVADA' },
  });
});
