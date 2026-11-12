// Endpoint de pruebas y recuperación tras perder el almacén (specs pruebas-carga y
// disponibilidad; tareas 3.2 y 4.1 del Sprint 6) contra el Worker empaquetado con
// PRUEBAS_HABILITADAS="true". El 404 sin la variable se prueba en reservas.int.test.ts.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import { semillaAdmin, semillaCategorias, URL_LOCAL } from '../scripts/semillas.ts';

const bd = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const servidor = createTestHarness({
  root: join(import.meta.dirname, '..'),
  workers: [
    { configPath: './wrangler.jsonc', vars: { COOKIE_DOMAIN: '', PRUEBAS_HABILITADAS: 'true' } },
  ],
});

const usuarios: string[] = [];
const productos: string[] = [];
const correoAdmin = `admin-pruebas-${randomUUID()}@prueba.local`;
let admin = '';

async function sesion(rol: 'CLIENTE' | 'ADMIN' = 'CLIENTE'): Promise<string> {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await bd.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, rol, actualizado_en)
     VALUES ($1, $2, 'x', $3, now())`,
    [id, `pruebas-${id}@prueba.local`, rol],
  );
  await bd.query(
    `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en)
     VALUES ($1, $2, $3, now() + interval '1 day')`,
    [randomUUID(), createHash('sha256').update(token).digest('hex'), id],
  );
  usuarios.push(id);
  return `xd_sesion=${token}`;
}

async function producto(stock: number): Promise<string> {
  const { rows } = await bd.query<{ id: string }>(
    `INSERT INTO productos (id, nombre, marca, categoria_id, tipo, precio, atributos, actualizado_en)
     SELECT $1, $2, 'Prueba', id, 'COMPONENTE', 199.00, '{"potenciaEntregadaW": 500}', now()
       FROM categorias WHERE codigo = 'FUENTE' RETURNING id`,
    [randomUUID(), `Fuente pérdida ${randomUUID().slice(0, 8)}`],
  );
  const pid = rows[0]!.id;
  await bd.query('INSERT INTO stock (id, producto_id, cantidad) VALUES ($1, $2, $3)', [
    randomUUID(),
    pid,
    stock,
  ]);
  productos.push(pid);
  return pid;
}

function enviar(metodo: string, ruta: string, cookie = '', cuerpo?: unknown) {
  return servidor.fetch(ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}
const disponible = async (pid: string) =>
  ((await (await servidor.fetch(`/productos/${pid}`)).json()) as { disponible: number }).disponible;

async function reservar(pid: string): Promise<void> {
  const cookie = await sesion();
  expect((await enviar('POST', '/carrito', cookie, { productoId: pid, cantidad: 1 })).status).toBe(
    200,
  );
  expect((await enviar('POST', '/reservas', cookie)).status).toBe(201);
}

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  await semillaCategorias(bd);
  await semillaAdmin(bd, correoAdmin, 'clave-admin-pruebas-1');
  const res = await servidor.fetch('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.83.0.1' },
    body: JSON.stringify({ correo: correoAdmin, contrasena: 'clave-admin-pruebas-1' }),
  });
  admin = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

afterAll(async () => {
  await bd.query(
    'DELETE FROM reserva_items WHERE reserva_id IN (SELECT id FROM reservas WHERE usuario_id = ANY($1))',
    [usuarios],
  );
  await bd.query('DELETE FROM reservas WHERE usuario_id = ANY($1)', [usuarios]);
  await bd.query('DELETE FROM usuarios WHERE id = ANY($1) OR correo = $2', [usuarios, correoAdmin]);
  if (productos.length) await bd.query('DELETE FROM productos WHERE id = ANY($1)', [productos]);
  await servidor.close();
  await bd.end();
});

describe('POST /pruebas/inventario/vaciar', () => {
  it('exige ADMIN', async () => {
    expect((await enviar('POST', '/pruebas/inventario/vaciar')).status).toBe(401);
    expect((await enviar('POST', '/pruebas/inventario/vaciar', await sesion())).status).toBe(403);
  });

  it('vacía el almacén y devuelve los conteos', async () => {
    const pid = await producto(5);
    await reservar(pid);
    const res = await enviar('POST', '/pruebas/inventario/vaciar', admin);
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { productos: number; reservas: number };
    expect(cuerpo.productos).toBeGreaterThanOrEqual(1);
    expect(cuerpo.reservas).toBeGreaterThanOrEqual(1);
    const sql = await servidor
      .getWorker()
      .getDurableObjectStorage('INVENTARIO', { name: 'catalogo' });
    expect((await sql.exec('SELECT COUNT(*) AS n FROM disponible'))[0]).toEqual({ n: 0 });
  });
});

describe('recuperación tras perder el almacén (spec disponibilidad)', () => {
  it('la reconstrucción perezosa y la reconciliación dejan físico − reservas activas', async () => {
    const pid = await producto(5);
    await reservar(pid);
    await reservar(pid);
    expect(await disponible(pid)).toBe(3);

    // Perezosa: el primer acceso tras vaciar reconstruye desde Postgres.
    await enviar('POST', '/pruebas/inventario/vaciar', admin);
    expect(await disponible(pid)).toBe(3);

    // Reconciliación sobre un almacén vacío: antes del Sprint 6 dejaba 5.
    await enviar('POST', '/pruebas/inventario/vaciar', admin);
    await servidor.getWorker().scheduled({ cron: '*/5 * * * *' });
    const sql = await servidor
      .getWorker()
      .getDurableObjectStorage('INVENTARIO', { name: 'catalogo' });
    const fila = (await sql.exec('SELECT cantidad FROM disponible WHERE producto_id = ?', pid))[0];
    expect(fila).toEqual({ cantidad: 3 });
    expect(await disponible(pid)).toBe(3);

    // No se puede reservar más de lo que queda.
    for (let i = 0; i < 3; i++) await reservar(pid);
    const cookie = await sesion();
    await enviar('POST', '/carrito', cookie, { productoId: pid, cantidad: 1 });
    expect((await enviar('POST', '/reservas', cookie)).status).toBe(409);
  });
});
