// Pago simulado, comprobantes, notificaciones e historial (specs pagos, comprobantes,
// notificaciones e historial; tareas 2.5, 3.5 y 4.3 del Sprint 4) contra el Worker
// empaquetado, el Postgres local y el Durable Object local de Wrangler.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  workers: [{ configPath: './wrangler.jsonc', vars: { COOKIE_DOMAIN: '' } }],
});

const usuarios: string[] = [];
const productos: string[] = [];
const sufijo = randomUUID().slice(0, 8);

const APROBADA = '4242 4242 4242 4242';
const RECHAZADA = '4000 0000 0000 0002';
const tarjeta = (numero = APROBADA) => ({
  numero,
  vencimiento: '12/30',
  cvv: '123',
  titular: 'Cliente Prueba',
});

/** Usuario y sesión creados directamente en la base (sin PBKDF2 ni límites). */
async function sesion(): Promise<{ id: string; cookie: string }> {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await bd.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en)
     VALUES ($1, $2, 'x', now())`,
    [id, `compra-${id}@prueba.local`],
  );
  await bd.query(
    `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en)
     VALUES ($1, $2, $3, now() + interval '1 day')`,
    [randomUUID(), createHash('sha256').update(token).digest('hex'), id],
  );
  usuarios.push(id);
  return { id, cookie: `xd_sesion=${token}` };
}

let precio = 91_000;
/** Producto de prueba propio (una fuente), con su stock. */
async function producto(stock: number, nombre = `Fuente compra ${sufijo}`): Promise<string> {
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

/** Copia propia de un producto sembrado de la categoría y socket indicados. */
async function copia(categoria: string, socket: string): Promise<string> {
  const { rows } = await bd.query<{ id: string }>(
    `INSERT INTO productos (id, nombre, marca, categoria_id, tipo, precio, atributos, actualizado_en)
     SELECT $1, 'Prueba ' || c.codigo || ' ${sufijo}', p.marca, p.categoria_id, p.tipo, p.precio, p.atributos, now()
       FROM productos p JOIN categorias c ON c.id = p.categoria_id
      WHERE c.codigo = $2 AND p.atributos->>'socket' = $3 AND p.activo
      ORDER BY p.nombre LIMIT 1 RETURNING id`,
    [randomUUID(), categoria, socket],
  );
  const pid = rows[0]!.id;
  await bd.query('INSERT INTO stock (id, producto_id, cantidad) VALUES ($1, $2, 5)', [
    randomUUID(),
    pid,
  ]);
  productos.push(pid);
  return pid;
}

function enviar(
  metodo: string,
  ruta: string,
  cookie = '',
  cuerpo?: unknown,
  extra: Record<string, string> = {},
) {
  return servidor.fetch(ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}
const json = async <T>(res: { json(): Promise<unknown> }) => (await res.json()) as T;

interface Orden {
  id: string;
  reservaId: string;
  total: string;
  comprobante: string;
  comprobanteId: string;
}
interface Notificaciones {
  notificaciones: { id: string; tipo: string; mensaje: string; leida: boolean }[];
  noLeidas: number;
}

/** Cliente con `cantidad` unidades de un producto nuevo reservadas. */
async function conReserva(stock = 5, cantidad = 1) {
  const s = await sesion();
  const pid = await producto(stock);
  const carrito = await enviar('POST', '/carrito', s.cookie, { productoId: pid, cantidad });
  expect(carrito.status, await carrito.clone().text()).toBe(200);
  const res = await enviar('POST', '/reservas', s.cookie);
  expect(res.status, await res.clone().text()).toBe(201);
  return { ...s, pid, reservaId: (await json<{ id: string }>(res)).id };
}

const pagar = (
  cookie: string,
  reservaId: string,
  numero = APROBADA,
  clave: string | null = `pago-${randomUUID()}`,
) =>
  enviar(
    'POST',
    '/pagos/confirmar',
    cookie,
    { reservaId, tarjeta: tarjeta(numero) },
    clave === null ? {} : { 'idempotency-key': clave },
  );

const stock = async (pid: string) =>
  (await bd.query('SELECT cantidad FROM stock WHERE producto_id = $1', [pid])).rows[0].cantidad;
const estadoReserva = async (id: string) =>
  (await bd.query('SELECT estado::text AS e FROM reservas WHERE id = $1', [id])).rows[0].e;
const ordenesDe = async (usuarioId: string) =>
  Number(
    (await bd.query('SELECT count(*) AS n FROM ordenes WHERE usuario_id = $1', [usuarioId])).rows[0]
      .n,
  );
const notificaciones = async (cookie: string) =>
  json<Notificaciones>(await enviar('GET', '/notificaciones', cookie));

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  await semillaCategorias(bd);
  await semillaReglas(bd);
  await semillaCatalogo(bd);
});

afterAll(async () => {
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

describe('pago (spec pagos)', () => {
  it('sin sesión: 401; sin Idempotency-Key: 400 sin orden', async () => {
    const r = await conReserva();
    expect((await pagar('', r.reservaId)).status).toBe(401);
    expect((await pagar(r.cookie, r.reservaId, APROBADA, null)).status).toBe(400);
    expect(await ordenesDe(r.id)).toBe(0);
  });

  it('aprobado: 201 con orden y comprobante XD-NNNNNN, stock y reserva CONFIRMADA', async () => {
    const r = await conReserva(5, 2);
    const res = await pagar(r.cookie, r.reservaId);
    expect(res.status, await res.clone().text()).toBe(201);
    const orden = await json<Orden>(res);
    expect(orden.comprobante).toMatch(/^XD-\d{6,}$/);
    expect(orden.comprobanteId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await stock(r.pid)).toBe(3);
    expect(await estadoReserva(r.reservaId)).toBe('CONFIRMADA');
    const carrito = await json<{ items: unknown[] }>(await enviar('GET', '/carrito', r.cookie));
    expect(carrito.items).toEqual([]);
  });

  it('número inválido: 400 y no se intenta el pago', async () => {
    const r = await conReserva();
    const res = await pagar(r.cookie, r.reservaId, '4242 4242 4242 4241');
    expect(res.status).toBe(400);
    expect(await estadoReserva(r.reservaId)).toBe('ACTIVA');
  });

  it('rechazado: 402 PAGO_RECHAZADO, la reserva sigue ACTIVA y el reintento aprobado confirma', async () => {
    const r = await conReserva(5, 1);
    const rechazo = await pagar(r.cookie, r.reservaId, RECHAZADA);
    expect(rechazo.status).toBe(402);
    expect((await json<{ codigo: string }>(rechazo)).codigo).toBe('PAGO_RECHAZADO');
    expect(await estadoReserva(r.reservaId)).toBe('ACTIVA');
    expect(await stock(r.pid)).toBe(5);
    expect(await ordenesDe(r.id)).toBe(0);
    expect((await pagar(r.cookie, r.reservaId)).status).toBe(201);
    expect(await stock(r.pid)).toBe(4);
  });

  it('reserva expirada, por vencer o ajena: 409 RESERVA_EXPIRADA sin orden', async () => {
    const r = await conReserva();
    await bd.query(`UPDATE reservas SET vence_en = now() + interval '10 seconds' WHERE id = $1`, [
      r.reservaId,
    ]);
    const porVencer = await pagar(r.cookie, r.reservaId);
    expect(porVencer.status).toBe(409);
    expect((await json<{ codigo: string }>(porVencer)).codigo).toBe('RESERVA_EXPIRADA');

    const otra = await conReserva();
    await bd.query(`UPDATE reservas SET estado = 'EXPIRADA' WHERE id = $1`, [otra.reservaId]);
    expect((await pagar(otra.cookie, otra.reservaId)).status).toBe(409);

    const ajena = await conReserva();
    const intruso = await sesion();
    expect((await pagar(intruso.cookie, ajena.reservaId)).status).toBe(409);
    expect(await estadoReserva(ajena.reservaId)).toBe('ACTIVA');
    expect(await ordenesDe(intruso.id)).toBe(0);
    expect(await ordenesDe(r.id)).toBe(0);
  });

  it('reintento con la misma clave: la misma orden, un solo descuento y un solo aviso', async () => {
    const r = await conReserva(5, 1);
    const clave = `pago-${randomUUID()}`;
    const a = await json<Orden>(await pagar(r.cookie, r.reservaId, APROBADA, clave));
    // El reintento ya no autoriza: ni siquiera una tarjeta de rechazo cambia el resultado.
    const res = await pagar(r.cookie, r.reservaId, RECHAZADA, clave);
    expect(res.status).toBe(201);
    expect((await json<Orden>(res)).id).toBe(a.id);
    expect(await stock(r.pid)).toBe(4);
    const n = await notificaciones(r.cookie);
    expect(n.notificaciones.filter((x) => x.tipo === 'COMPRA_CONFIRMADA')).toHaveLength(1);
  });

  it('la clave de otra compra: 409', async () => {
    const a = await conReserva();
    const clave = `pago-${randomUUID()}`;
    expect((await pagar(a.cookie, a.reservaId, APROBADA, clave)).status).toBe(201);
    const b = await conReserva();
    expect((await pagar(b.cookie, b.reservaId, APROBADA, clave)).status).toBe(409);
  });

  it('dos pagos simultáneos con la misma clave: una sola orden', async () => {
    const r = await conReserva(5, 1);
    const clave = `pago-${randomUUID()}`;
    const [x, y] = await Promise.all([
      pagar(r.cookie, r.reservaId, APROBADA, clave),
      pagar(r.cookie, r.reservaId, APROBADA, clave),
    ]);
    expect([x.status, y.status]).toEqual([201, 201]);
    expect((await json<Orden>(x)).id).toBe((await json<Orden>(y)).id);
    expect(await ordenesDe(r.id)).toBe(1);
    expect(await stock(r.pid)).toBe(4);
  });

  it('no guarda el número completo ni el CVV; el comprobante tiene los 4 últimos', async () => {
    const r = await conReserva();
    const orden = await json<Orden>(await pagar(r.cookie, r.reservaId));
    const { rows } = await bd.query(
      `SELECT c.detalle::text AS detalle, o::text AS orden,
              (SELECT string_agg(n.mensaje, ' ') FROM notificaciones n WHERE n.usuario_id = $1) AS avisos
         FROM comprobantes c JOIN ordenes o ON o.id = c.orden_id WHERE o.usuario_id = $1`,
      [r.id],
    );
    const todo = JSON.stringify(rows);
    expect(todo).not.toContain('4242424242424242');
    expect(todo).not.toContain('4242 4242 4242 4242');
    expect(JSON.parse(rows[0].detalle).tarjeta).toEqual({ ultimos4: '4242' });
    expect(orden.comprobante).toMatch(/^XD-/);
  });
});

describe('comprobantes (spec comprobantes)', () => {
  it('10 confirmaciones simultáneas: números distintos y consecutivos', async () => {
    const reservas = [];
    for (let i = 0; i < 10; i++) reservas.push(await conReserva());
    const respuestas = await Promise.all(reservas.map((r) => pagar(r.cookie, r.reservaId)));
    expect(respuestas.map((r) => r.status)).toEqual(Array(10).fill(201));
    const numeros = (await Promise.all(respuestas.map((r) => json<Orden>(r))))
      .map((o) => o.comprobante)
      .sort();
    expect(new Set(numeros).size).toBe(10);
    const n = numeros.map((x) => Number(x.slice(3)));
    expect(n.at(-1)! - n[0]!).toBe(9);
  }, 120_000);

  it('dos compras seguidas: la segunda tiene el número siguiente', async () => {
    const a = await conReserva();
    const b = await conReserva();
    const na = Number((await json<Orden>(await pagar(a.cookie, a.reservaId))).comprobante.slice(3));
    const nb = Number((await json<Orden>(await pagar(b.cookie, b.reservaId))).comprobante.slice(3));
    expect(nb).toBe(na + 1);
  });

  it('GET /comprobantes/:id: el dueño ve detalle con nombre del momento; ajeno 404', async () => {
    const r = await conReserva(5, 2);
    const orden = await json<Orden>(await pagar(r.cookie, r.reservaId));
    const { rows } = await bd.query(
      'SELECT nombre, precio::text AS precio FROM productos WHERE id = $1',
      [r.pid],
    );
    await bd.query(`UPDATE productos SET nombre = 'Nombre nuevo', precio = 1 WHERE id = $1`, [
      r.pid,
    ]);

    const res = await enviar('GET', `/comprobantes/${orden.comprobanteId}`, r.cookie);
    expect(res.status).toBe(200);
    const c = await json<{
      numero: string;
      cliente: string;
      items: { nombre: string; cantidad: number; precioUnitario: string; subtotal: string }[];
      total: string;
      tarjeta: { ultimos4: string };
    }>(res);
    expect(c.numero).toBe(orden.comprobante);
    expect(c.cliente).toBe(`compra-${r.id}@prueba.local`);
    const p = Number(rows[0].precio);
    expect(c.items).toEqual([
      expect.objectContaining({
        nombre: rows[0].nombre,
        cantidad: 2,
        precioUnitario: p.toFixed(2),
        subtotal: (p * 2).toFixed(2),
      }),
    ]);
    expect(c.total).toBe((p * 2).toFixed(2));
    expect(c.tarjeta).toEqual({ ultimos4: '4242' });

    const otro = await sesion();
    expect((await enviar('GET', `/comprobantes/${orden.comprobanteId}`, otro.cookie)).status).toBe(
      404,
    );
    expect((await enviar('GET', `/comprobantes/${orden.comprobanteId}`)).status).toBe(401);
    expect((await enviar('GET', '/comprobantes/no-es-uuid', r.cookie)).status).toBe(404);
  });
});

describe('notificaciones (spec notificaciones)', () => {
  it('sin sesión: 401', async () => {
    expect((await enviar('GET', '/notificaciones')).status).toBe(401);
  });

  it('producto agotado al reservar: un aviso con el nombre, sin duplicar si no se leyó', async () => {
    const s = await sesion();
    const pid = await producto(1, `Fuente escasa ${sufijo}`);
    expect(
      (await enviar('POST', '/carrito', s.cookie, { productoId: pid, cantidad: 2 })).status,
    ).toBe(200);
    expect((await enviar('POST', '/reservas', s.cookie)).status).toBe(409);
    expect((await enviar('POST', '/reservas', s.cookie)).status).toBe(409);
    const n = await notificaciones(s.cookie);
    const agotados = n.notificaciones.filter((x) => x.tipo === 'PRODUCTO_AGOTADO');
    expect(agotados).toHaveLength(1);
    expect(agotados[0]!.mensaje).toContain(`Fuente escasa ${sufijo}`);
    expect(agotados[0]!.leida).toBe(false);
    expect(n.noLeidas).toBe(1);

    // Leído el aviso, un nuevo intento sí avisa otra vez.
    expect(
      (await enviar('PATCH', `/notificaciones/${agotados[0]!.id}/leida`, s.cookie)).status,
    ).toBe(200);
    expect((await enviar('POST', '/reservas', s.cookie)).status).toBe(409);
    expect((await notificaciones(s.cookie)).noLeidas).toBe(1);
  });

  it('compra confirmada: aviso con el número de comprobante', async () => {
    const r = await conReserva();
    const orden = await json<Orden>(await pagar(r.cookie, r.reservaId));
    const n = await notificaciones(r.cookie);
    expect(n.noLeidas).toBe(1);
    expect(n.notificaciones[0]).toMatchObject({ tipo: 'COMPRA_CONFIRMADA', leida: false });
    expect(n.notificaciones[0]!.mensaje).toContain(orden.comprobante);
  });

  it('solo las propias; marcar como leída es idempotente y la ajena da 404', async () => {
    const a = await conReserva();
    await pagar(a.cookie, a.reservaId);
    const b = await conReserva();
    await pagar(b.cookie, b.reservaId);
    const deA = await notificaciones(a.cookie);
    const deB = await notificaciones(b.cookie);
    expect(deA.notificaciones).toHaveLength(1);
    expect(deA.notificaciones[0]!.id).not.toBe(deB.notificaciones[0]!.id);

    const id = deA.notificaciones[0]!.id;
    expect((await enviar('PATCH', `/notificaciones/${id}/leida`, b.cookie)).status).toBe(404);
    expect((await notificaciones(a.cookie)).noLeidas).toBe(1);
    const marcada = await enviar('PATCH', `/notificaciones/${id}/leida`, a.cookie);
    expect(marcada.status).toBe(200);
    expect((await json<{ leida: boolean }>(marcada)).leida).toBe(true);
    expect((await enviar('PATCH', `/notificaciones/${id}/leida`, a.cookie)).status).toBe(200);
    expect((await notificaciones(a.cookie)).noLeidas).toBe(0);
    expect((await enviar('PATCH', '/notificaciones/x/leida', a.cookie)).status).toBe(404);
  });
});

describe('historial (spec historial)', () => {
  it('compras: solo las propias, la más reciente primero, con comprobante y paginación', async () => {
    const s = await sesion();
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const pid = await producto(5);
      await enviar('POST', '/carrito', s.cookie, { productoId: pid, cantidad: 1 });
      const reserva = await json<{ id: string }>(await enviar('POST', '/reservas', s.cookie));
      ids.push((await json<Orden>(await pagar(s.cookie, reserva.id))).id);
    }
    const otro = await conReserva();
    await pagar(otro.cookie, otro.reservaId);

    expect((await enviar('GET', '/historial/compras')).status).toBe(401);
    const res = await enviar('GET', '/historial/compras', s.cookie);
    expect(res.status).toBe(200);
    const h = await json<{
      elementos: {
        id: string;
        estado: string;
        productos: number;
        comprobante: { numero: string };
      }[];
      total: number;
      pagina: number;
    }>(res);
    expect(h.total).toBe(2);
    expect(h.elementos.map((e) => e.id)).toEqual([ids[1], ids[0]]);
    expect(h.elementos[0]).toMatchObject({ estado: 'PAGADA', productos: 1 });
    expect(h.elementos[0]!.comprobante.numero).toMatch(/^XD-/);
    expect((await enviar('GET', '/historial/compras?pagina=0', s.cookie)).status).toBe(400);
    const pagina2 = await json<{ elementos: unknown[] }>(
      await enviar('GET', '/historial/compras?pagina=2', s.cookie),
    );
    expect(pagina2.elementos).toEqual([]);
  });

  it('detalle de una compra propia; la ajena da 404', async () => {
    const r = await conReserva(5, 2);
    const orden = await json<Orden>(await pagar(r.cookie, r.reservaId));
    const res = await enviar('GET', `/historial/compras/${orden.id}`, r.cookie);
    expect(res.status).toBe(200);
    const d = await json<{
      total: string;
      comprobante: { numero: string };
      items: { producto: { id: string; nombre: string }; cantidad: number; subtotal: string }[];
    }>(res);
    expect(d.comprobante.numero).toBe(orden.comprobante);
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ producto: { id: r.pid }, cantidad: 2, subtotal: d.total });
    const otro = await sesion();
    expect((await enviar('GET', `/historial/compras/${orden.id}`, otro.cookie)).status).toBe(404);
  });

  it('configuraciones: todas las propias con origen, estado y componentes; revalidar guarda', async () => {
    const s = await sesion();
    const cpu = await copia('PROCESADOR', 'AM5');
    const placa = await copia('PLACA_MADRE', 'AM5');
    const items = [
      { productoId: cpu, cantidad: 1 },
      { productoId: placa, cantidad: 1 },
    ];
    const valida = await json<{ id: string; estado: string }>(
      await enviar('POST', '/configuraciones', s.cookie, { items }),
    );
    expect(valida.estado).toBe('VALIDA');
    const sola = await json<{ id: string }>(
      await enviar('POST', '/configuraciones', s.cookie, { items: [items[0]] }),
    );

    const lista = await json<{
      elementos: {
        id: string;
        origen: string;
        estado: string;
        presupuesto: string | null;
        componentes: { productoId: string; categoria: string; cantidad: number }[];
      }[];
      total: number;
    }>(await enviar('GET', '/historial/configuraciones', s.cookie));
    expect(lista.total).toBe(2);
    expect(lista.elementos.map((c) => c.id)).toEqual([sola.id, valida.id]);
    expect(lista.elementos[1]).toMatchObject({
      origen: 'MANUAL',
      estado: 'VALIDA',
      presupuesto: null,
    });
    expect(lista.elementos[1]!.componentes.map((c) => c.categoria).sort()).toEqual([
      'PLACA_MADRE',
      'PROCESADOR',
    ]);

    // Agotado desde que se guardó: no es agregable y se nombra el procesador.
    await bd.query('UPDATE stock SET cantidad = 0 WHERE producto_id = $1', [cpu]);
    await servidor.getWorker().scheduled({ cron: '*/5 * * * *' }); // reconcilia el almacén
    type Revalidada = {
      estado: string;
      agregable: boolean;
      rechazos: { codigo: string }[];
      faltantes: { productoId: string }[];
    };
    const r1 = await json<Revalidada>(
      await enviar('POST', `/historial/configuraciones/${valida.id}/revalidar`, s.cookie),
    );
    expect(r1).toMatchObject({ estado: 'VALIDA', agregable: false });
    expect(r1.faltantes.map((f) => f.productoId)).toEqual([cpu]);

    // Una regla vigente que ahora la rechaza: queda INVALIDA y se guarda.
    await bd.query(
      `UPDATE productos SET atributos = atributos || '{"socket":"AM4"}' WHERE id = $1`,
      [placa],
    );
    const r2 = await json<Revalidada>(
      await enviar('POST', `/historial/configuraciones/${valida.id}/revalidar`, s.cookie),
    );
    expect(r2.estado).toBe('INVALIDA');
    expect(r2.rechazos.map((x) => x.codigo)).toContain('SOCKET');
    const guardada = await bd.query('SELECT estado::text AS e FROM configuraciones WHERE id = $1', [
      valida.id,
    ]);
    expect(guardada.rows[0].e).toBe('INVALIDA');

    const otro = await sesion();
    expect(
      (await enviar('POST', `/historial/configuraciones/${valida.id}/revalidar`, otro.cookie))
        .status,
    ).toBe(404);
    expect(
      (
        await json<{ total: number }>(
          await enviar('GET', '/historial/configuraciones', otro.cookie),
        )
      ).total,
    ).toBe(0);
  });
});
