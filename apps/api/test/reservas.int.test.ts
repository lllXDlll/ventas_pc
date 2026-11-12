// Carrito, reservas, disponibilidad, confirmación y concurrencia (specs carrito, reservas y
// disponibilidad; tareas 1.2, 1.3, 2.1, 3.1, 3.3, 3.4 y 3.5 del Sprint 3) contra el Worker
// empaquetado, el Postgres local y el Durable Object local de Wrangler.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import {
  semillaAdmin,
  semillaCatalogo,
  semillaCategorias,
  semillaReglas,
  URL_LOCAL,
} from '../scripts/semillas.ts';

const bd = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const servidor = createTestHarness({
  root: join(import.meta.dirname, '..'),
  workers: [{ configPath: './wrangler.jsonc', vars: { COOKIE_DOMAIN: '' } }],
});

const usuarios: string[] = [];
const productos: string[] = [];
const sufijo = randomUUID().slice(0, 8);
let admin = '';

/** Usuario y sesión creados directamente en la base (sin PBKDF2 ni límites). */
async function sesion(): Promise<{ id: string; cookie: string }> {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await bd.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en)
     VALUES ($1, $2, 'x', now())`,
    [id, `reserva-${id}@prueba.local`],
  );
  await bd.query(
    `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en)
     VALUES ($1, $2, $3, now() + interval '1 day')`,
    [randomUUID(), createHash('sha256').update(token).digest('hex'), id],
  );
  usuarios.push(id);
  return { id, cookie: `xd_sesion=${token}` };
}

let precio = 81_000;
/** Producto de prueba propio, con su stock (fuente: atributos mínimos). */
async function producto(stock: number, nombre = `Fuente reserva ${sufijo}`): Promise<string> {
  const { rows } = await bd.query<{ id: string }>(
    `INSERT INTO productos (id, nombre, marca, categoria_id, tipo, precio, atributos, actualizado_en)
     SELECT $1, $2, 'Prueba', id, 'COMPONENTE', $3, '{"potenciaEntregadaW": 500}', now()
       FROM categorias WHERE codigo = 'FUENTE' RETURNING id`,
    [randomUUID(), nombre, precio++],
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
const json = async <T>(res: { json(): Promise<unknown> }) => (await res.json()) as T;

const disponible = async (pid: string) =>
  (await json<{ disponible: number }>(await servidor.fetch(`/productos/${pid}`))).disponible;

async function alCarrito(cookie: string, productoId: string, cantidad = 1) {
  const res = await enviar('POST', '/carrito', cookie, { productoId, cantidad });
  expect(res.status, await res.clone().text()).toBe(200);
}

interface VistaCarrito {
  items: { id: string; tipo: string; cantidad: number; subtotal: string; sinDisponible: boolean }[];
  total: string;
  cantidadProductos: number;
}
interface VistaReserva {
  id: string;
  estado: string;
  venceEn: string;
  items: { producto: { id: string }; cantidad: number }[];
}

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  await semillaCategorias(bd);
  await semillaReglas(bd);
  await semillaCatalogo(bd);
  const correoAdmin = `admin-res-${sufijo}@prueba.local`;
  await semillaAdmin(bd, correoAdmin, 'clave-admin-segura-1');
  const login = await servidor.fetch('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.80.0.1' },
    body: JSON.stringify({ correo: correoAdmin, contrasena: 'clave-admin-segura-1' }),
  });
  admin = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const { rows } = await bd.query('SELECT id FROM usuarios WHERE correo = $1', [correoAdmin]);
  usuarios.push(rows[0].id);
});

afterAll(async () => {
  // Orden: órdenes y reservas referencian usuarios y productos.
  await bd.query(
    'DELETE FROM comprobantes WHERE orden_id IN (SELECT id FROM ordenes WHERE usuario_id = ANY($1))',
    [usuarios],
  );
  await bd.query('DELETE FROM ordenes WHERE usuario_id = ANY($1)', [usuarios]);
  await bd.query('DELETE FROM reservas WHERE usuario_id = ANY($1)', [usuarios]);
  await bd.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarios]);
  await bd.query('DELETE FROM productos WHERE id = ANY($1)', [productos]);
  await servidor.close();
  await bd.end();
});

describe('carrito (spec carrito)', () => {
  it('sin sesión: 401', async () => {
    expect((await enviar('GET', '/carrito')).status).toBe(401);
    expect(
      (await enviar('POST', '/carrito', '', { productoId: randomUUID(), cantidad: 1 })).status,
    ).toBe(401);
  });

  it('vacío, suma el mismo producto, cambia cantidades, quita y vacía', async () => {
    const { cookie } = await sesion();
    expect(await json<VistaCarrito>(await enviar('GET', '/carrito', cookie))).toEqual({
      items: [],
      total: '0.00',
      cantidadProductos: 0,
    });
    const pid = await producto(10);
    await alCarrito(cookie, pid);
    await alCarrito(cookie, pid);
    let c = await json<VistaCarrito>(await enviar('GET', '/carrito', cookie));
    expect(c.items).toHaveLength(1);
    expect(c.items[0]).toMatchObject({ tipo: 'PRODUCTO', cantidad: 2 });
    const item = c.items[0]!.id;
    c = await json<VistaCarrito>(
      await enviar('PATCH', `/carrito/items/${item}`, cookie, { cantidad: 3 }),
    );
    const unitario = Number(c.items[0]!.subtotal) / 3;
    expect(c.total).toBe((unitario * 3).toFixed(2));
    expect(c.cantidadProductos).toBe(3);
    c = await json<VistaCarrito>(await enviar('DELETE', `/carrito/items/${item}`, cookie));
    expect(c.items).toEqual([]);
    await alCarrito(cookie, pid);
    expect((await json<VistaCarrito>(await enviar('DELETE', '/carrito', cookie))).items).toEqual(
      [],
    );
  });

  it('configuración incompatible: 409 con rechazos; compatible: entra; ajena: 404', async () => {
    const id = (n: number) => `0195a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
    const ana = await sesion();
    const beto = await sesion();
    const crear = async (items: [number, number][]) =>
      json<{ id: string }>(
        await enviar('POST', '/configuraciones', ana.cookie, {
          items: items.map(([n, cantidad]) => ({ productoId: id(n), cantidad })),
        }),
      );
    const mala = await crear([
      [3, 1],
      [10, 1],
    ]); // LGA1700 con AM5
    const res = await enviar('POST', '/carrito', ana.cookie, {
      configuracionId: mala.id,
      cantidad: 1,
    });
    expect(res.status).toBe(409);
    const cuerpo = await json<{ codigo: string; detalle: { rechazos: { codigo: string }[] } }>(res);
    expect(cuerpo.codigo).toBe('CONFIGURACION_INCOMPATIBLE');
    expect(cuerpo.detalle.rechazos.map((r) => r.codigo)).toContain('SOCKET');

    const buena = await crear([
      [1, 1],
      [10, 1],
    ]);
    const ok = await enviar('POST', '/carrito', ana.cookie, {
      configuracionId: buena.id,
      cantidad: 1,
    });
    expect(ok.status).toBe(200);
    expect((await json<VistaCarrito>(ok)).items[0]).toMatchObject({ tipo: 'CONFIGURACION' });

    expect(
      (await enviar('POST', '/carrito', beto.cookie, { configuracionId: buena.id, cantidad: 1 }))
        .status,
    ).toBe(404);
    const item = (await json<VistaCarrito>(await enviar('GET', '/carrito', ana.cookie))).items[0]!
      .id;
    expect((await enviar('DELETE', `/carrito/items/${item}`, beto.cookie)).status).toBe(404);
    expect((await enviar('POST', '/carrito', ana.cookie, { cantidad: 1 })).status).toBe(400);
  });
});

describe('reservas (spec reservas)', () => {
  it('carrito vacío: 400', async () => {
    const { cookie } = await sesion();
    expect((await enviar('POST', '/reservas', cookie)).status).toBe(400);
  });

  it('reserva todo el carrito, baja el disponible y GET activa la devuelve con su vencimiento', async () => {
    const { cookie } = await sesion();
    const a = await producto(5);
    const b = await producto(4);
    await alCarrito(cookie, a, 2);
    await alCarrito(cookie, b, 1);
    const res = await enviar('POST', '/reservas', cookie);
    expect(res.status, await res.clone().text()).toBe(201);
    const r = await json<VistaReserva>(res);
    expect(r.estado).toBe('ACTIVA');
    const ttl = new Date(r.venceEn).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000);
    expect(await disponible(a)).toBe(3);
    expect(await disponible(b)).toBe(3);
    expect((await json<VistaReserva>(await enviar('GET', '/reservas/activa', cookie))).id).toBe(
      r.id,
    );
  });

  it('un producto insuficiente: 409 nombrándolo y no descuenta ninguno', async () => {
    const { cookie } = await sesion();
    const a = await producto(5);
    const b = await producto(1, `Escasa ${sufijo}`);
    await alCarrito(cookie, a, 2);
    await alCarrito(cookie, b, 2);
    const res = await enviar('POST', '/reservas', cookie);
    expect(res.status).toBe(409);
    const cuerpo = await json<{
      codigo: string;
      detalle: { productoId: string; disponible: number };
    }>(res);
    expect(cuerpo).toMatchObject({
      codigo: 'SIN_STOCK',
      detalle: { productoId: b, disponible: 1 },
    });
    expect(await disponible(a)).toBe(5);
    expect(await disponible(b)).toBe(1);
  });

  it('reservar de nuevo libera la anterior: una sola activa', async () => {
    const { id, cookie } = await sesion();
    const a = await producto(5);
    await alCarrito(cookie, a, 2);
    const primera = await json<VistaReserva>(await enviar('POST', '/reservas', cookie));
    const segunda = await json<VistaReserva>(await enviar('POST', '/reservas', cookie));
    expect(segunda.id).not.toBe(primera.id);
    expect(await disponible(a)).toBe(3);
    const { rows } = await bd.query<{ id: string; estado: string }>(
      'SELECT id, estado::text AS estado FROM reservas WHERE usuario_id = $1 ORDER BY creada_en',
      [id],
    );
    expect(rows.map((x) => x.estado)).toEqual(['EXPIRADA', 'ACTIVA']);
  });

  it('cancelar devuelve el stock y deja EXPIRADA; ajena o repetida: 404', async () => {
    const ana = await sesion();
    const beto = await sesion();
    const a = await producto(5);
    await alCarrito(ana.cookie, a, 2);
    const r = await json<VistaReserva>(await enviar('POST', '/reservas', ana.cookie));
    expect((await enviar('DELETE', `/reservas/${r.id}`, beto.cookie)).status).toBe(404);
    expect((await enviar('DELETE', `/reservas/${r.id}`, ana.cookie)).status).toBe(204);
    expect(await disponible(a)).toBe(5);
    expect((await enviar('DELETE', `/reservas/${r.id}`, ana.cookie)).status).toBe(404);
    expect((await enviar('GET', '/reservas/activa', ana.cookie)).status).toBe(404);
  });
});

describe('disponibilidad (spec disponibilidad y catalogo)', () => {
  it('stock 7 y una reserva de 2 muestra 5; con todo reservado desaparece del listado', async () => {
    const { cookie } = await sesion();
    const pid = await producto(7);
    const p = (await bd.query('SELECT precio::text FROM productos WHERE id = $1', [pid])).rows[0]
      .precio;
    await alCarrito(cookie, pid, 2);
    await enviar('POST', '/reservas', cookie);
    expect(await disponible(pid)).toBe(5);

    const otro = await sesion();
    await alCarrito(otro.cookie, pid, 5);
    expect((await enviar('POST', '/reservas', otro.cookie)).status).toBe(201);
    const lista = await json<{ total: number }>(
      await servidor.fetch(`/productos?precioMin=${p}&precioMax=${p}`),
    );
    expect(lista.total).toBe(0);
    expect(
      await json<{ agotado: boolean }>(await servidor.fetch(`/productos/${pid}`)),
    ).toMatchObject({
      agotado: true,
    });
  });

  it('una reposición del ADMIN sube el disponible en la diferencia', async () => {
    const pid = await producto(5);
    expect(await disponible(pid)).toBe(5);
    const res = await enviar('PATCH', `/admin/stock/${pid}`, admin, { cantidad: 8, version: 0 });
    expect(res.status).toBe(200);
    expect(await disponible(pid)).toBe(8);
  });

  it('con el almacén vacío el disponible se reconstruye solo; la reconciliación corrige desvíos', async () => {
    const { cookie } = await sesion();
    const pid = await producto(6);
    await alCarrito(cookie, pid, 2);
    await enviar('POST', '/reservas', cookie);
    const sql = await servidor
      .getWorker()
      .getDurableObjectStorage('INVENTARIO', { name: 'catalogo' });
    await sql.exec('DELETE FROM disponible');
    expect(await disponible(pid)).toBe(4); // 6 − 2 desde Postgres

    await sql.exec('UPDATE disponible SET cantidad = 99 WHERE producto_id = ?', pid);
    expect(await disponible(pid)).toBe(99);
    await servidor.getWorker().scheduled({ cron: '*/5 * * * *' });
    expect(await disponible(pid)).toBe(4); // 6 − 2 reservadas en el objeto
  });
});

describe('confirmación (spec reservas)', () => {
  type Api = {
    confirmar(u: string, r: string, c: string): Promise<{ id: string; comprobante: string }>;
  };
  const api = async () => (await servidor.getWorker().getExport()) as unknown as Api;
  /** Mensaje del error de una llamada RPC (el stub devuelve un thenable, no una Promise). */
  const errorDe = async (llamada: () => Promise<unknown>): Promise<string> => {
    try {
      await llamada();
      return '';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  async function reservaDe(stock: number, cantidad: number) {
    const s = await sesion();
    const pid = await producto(stock);
    await alCarrito(s.cookie, pid, cantidad);
    const r = await json<VistaReserva>(await enviar('POST', '/reservas', s.cookie));
    return { ...s, pid, reservaId: r.id };
  }
  const stock = async (pid: string) =>
    (await bd.query('SELECT cantidad, version FROM stock WHERE producto_id = $1', [pid])).rows[0];

  it('descuenta con versión, crea orden y comprobante, CONFIRMADA y no devuelve stock', async () => {
    const r = await reservaDe(5, 2);
    await bd.query('UPDATE stock SET version = 3 WHERE producto_id = $1', [r.pid]);
    const orden = await (await api()).confirmar(r.id, r.reservaId, `clave-${randomUUID()}`);
    expect(await stock(r.pid)).toEqual({ cantidad: 3, version: 4 });
    expect(orden.comprobante).toMatch(/^XD-\d{8}-[0-9A-F]{6}$/);
    const { rows } = await bd.query('SELECT estado::text AS estado FROM reservas WHERE id = $1', [
      r.reservaId,
    ]);
    expect(rows[0].estado).toBe('CONFIRMADA');
    expect(await disponible(r.pid)).toBe(3); // cerrar no devolvió las 2 unidades
  });

  it('idempotente: la misma clave devuelve la misma orden y descuenta una vez', async () => {
    const r = await reservaDe(5, 1);
    const clave = `clave-${randomUUID()}`;
    const a = await (await api()).confirmar(r.id, r.reservaId, clave);
    const b = await (await api()).confirmar(r.id, r.reservaId, clave);
    expect(b.id).toBe(a.id);
    expect((await stock(r.pid)).cantidad).toBe(4);
    expect(
      await errorDe(async () => (await api()).confirmar(r.id, r.reservaId, `otra-${randomUUID()}`)),
    ).toMatch(/CONFLICTO|CLAVE_EN_USO/);
  });

  it('dos confirmaciones simultáneas con la misma clave: una sola orden', async () => {
    const r = await reservaDe(5, 1);
    const clave = `clave-${randomUUID()}`;
    const [a, b] = await Promise.all([
      (await api()).confirmar(r.id, r.reservaId, clave),
      (await api()).confirmar(r.id, r.reservaId, clave),
    ]);
    expect(a.id).toBe(b.id);
    const { rows } = await bd.query(
      'SELECT count(*)::int AS n FROM ordenes WHERE reserva_id = $1',
      [r.reservaId],
    );
    expect(rows[0].n).toBe(1);
    expect((await stock(r.pid)).cantidad).toBe(4);
  });

  it('reserva vencida o a punto de vencer: RESERVA_EXPIRADA sin orden; sin clave: rechazo', async () => {
    const r = await reservaDe(5, 1);
    await bd.query(`UPDATE reservas SET vence_en = now() + interval '10 seconds' WHERE id = $1`, [
      r.reservaId,
    ]);
    expect(
      await errorDe(async () =>
        (await api()).confirmar(r.id, r.reservaId, `clave-${randomUUID()}`),
      ),
    ).toMatch(/RESERVA_EXPIRADA/);
    expect(await errorDe(async () => (await api()).confirmar(r.id, r.reservaId, ''))).toMatch(
      /SOLICITUD_INVALIDA/,
    );
    expect((await stock(r.pid)).cantidad).toBe(5);
  });
});

describe('concurrencia (spec reservas)', () => {
  it('60 clientes sobre 5 unidades: exactamente 5 reservas, el resto 409, disponible 0', async () => {
    const pid = await producto(5, `Limitada ${sufijo}`);
    const clientes = await Promise.all(Array.from({ length: 60 }, () => sesion()));
    for (const c of clientes) await alCarrito(c.cookie, pid, 1);
    const respuestas = await Promise.all(
      clientes.map(async (c) => {
        const res = await enviar('POST', '/reservas', c.cookie);
        return { status: res.status, cuerpo: await res.text() };
      }),
    );
    const estados = respuestas.map((r) => r.status);
    const otros = respuestas.filter((r) => r.status !== 201 && r.status !== 409);
    expect(otros.slice(0, 3)).toEqual([]);
    expect(estados.filter((s) => s === 201)).toHaveLength(5);
    expect(estados.filter((s) => s === 409)).toHaveLength(55);
    expect(await disponible(pid)).toBe(0);
    const { rows } = await bd.query(
      `SELECT COALESCE(SUM(ri.cantidad), 0)::int AS n FROM reserva_items ri
         JOIN reservas r ON r.id = ri.reserva_id WHERE r.estado = 'ACTIVA' AND ri.producto_id = $1`,
      [pid],
    );
    expect(rows[0].n).toBe(5);
  });
});
