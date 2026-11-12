// Expiración de reservas (spec reservas "Expiración automática"; tarea 3.2 del Sprint 3):
// TTL de 3 s (RESERVA_TTL_MIN=0.05) para no esperar 10 minutos.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as esperar } from 'node:timers/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import { semillaCategorias, URL_LOCAL } from '../scripts/semillas.ts';

const bd = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const servidor = createTestHarness({
  root: join(import.meta.dirname, '..'),
  workers: [
    { configPath: './wrangler.jsonc', vars: { COOKIE_DOMAIN: '', RESERVA_TTL_MIN: '0.05' } },
  ],
});
const usuarios: string[] = [];
const productos: string[] = [];

async function sesion(): Promise<{ id: string; cookie: string }> {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await bd.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en) VALUES ($1, $2, 'x', now())`,
    [id, `exp-${id}@prueba.local`],
  );
  await bd.query(
    `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en) VALUES ($1, $2, $3, now() + interval '1 day')`,
    [randomUUID(), createHash('sha256').update(token).digest('hex'), id],
  );
  usuarios.push(id);
  return { id, cookie: `xd_sesion=${token}` };
}

async function producto(stock: number): Promise<string> {
  const { rows } = await bd.query<{ id: string }>(
    `INSERT INTO productos (id, nombre, marca, categoria_id, tipo, precio, atributos, actualizado_en)
     SELECT $1, $2, 'Prueba', id, 'COMPONENTE', 82000, '{"potenciaEntregadaW": 500}', now()
       FROM categorias WHERE codigo = 'FUENTE' RETURNING id`,
    [randomUUID(), `Fuente expiración ${randomUUID().slice(0, 6)}`],
  );
  await bd.query('INSERT INTO stock (id, producto_id, cantidad) VALUES ($1, $2, $3)', [
    randomUUID(),
    rows[0]!.id,
    stock,
  ]);
  productos.push(rows[0]!.id);
  return rows[0]!.id;
}

const enviar = (metodo: string, ruta: string, cookie: string, cuerpo?: unknown) =>
  servidor.fetch(ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', cookie },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
const disponible = async (pid: string) =>
  ((await (await servidor.fetch(`/productos/${pid}`)).json()) as { disponible: number }).disponible;
const estado = async (id: string) =>
  (await bd.query('SELECT estado::text AS e FROM reservas WHERE id = $1', [id])).rows[0]?.e;

async function reservar(cookie: string, pid: string, cantidad: number) {
  await enviar('POST', '/carrito', cookie, { productoId: pid, cantidad });
  const res = await enviar('POST', '/reservas', cookie);
  return { status: res.status, cuerpo: (await res.json()) as { id: string } };
}

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  await semillaCategorias(bd);
});

afterAll(async () => {
  await bd.query('DELETE FROM reservas WHERE usuario_id = ANY($1)', [usuarios]);
  await bd.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarios]);
  await bd.query('DELETE FROM productos WHERE id = ANY($1)', [productos]);
  await servidor.close();
  await bd.end();
});

describe('expiración de reservas', () => {
  it('el cron de cada minuto devuelve el stock y deja la reserva EXPIRADA', async () => {
    const { cookie } = await sesion();
    const pid = await producto(5);
    const r = await reservar(cookie, pid, 3);
    expect(r.status).toBe(201);
    expect(await disponible(pid)).toBe(2);
    await esperar(3_500);
    await servidor.getWorker().scheduled({ cron: '* * * * *' });
    expect(await estado(r.cuerpo.id)).toBe('EXPIRADA');
    expect(await disponible(pid)).toBe(5);
  });

  it('antes de reservar se expira lo vencido: otro cliente reserva sin esperar al cron', async () => {
    const ana = await sesion();
    const beto = await sesion();
    const pid = await producto(2);
    const primera = await reservar(ana.cookie, pid, 2);
    expect(primera.status).toBe(201);
    expect((await reservar(beto.cookie, pid, 1)).status).toBe(409); // todo tomado
    await esperar(3_500);
    // Beto ya tiene 1 unidad en el carrito: solo vuelve a iniciar la compra.
    const res = await enviar('POST', '/reservas', beto.cookie);
    const segunda = { status: res.status };
    expect(segunda.status).toBe(201);
    expect(await estado(primera.cuerpo.id)).toBe('EXPIRADA');
    expect(await disponible(pid)).toBe(1);
  });
});
