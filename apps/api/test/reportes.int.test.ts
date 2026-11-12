// Reportes del panel (spec reportes; tareas 2.3 y 2.4 del Sprint 6) contra el Worker
// empaquetado y el Postgres local. Los datos se siembran en 2020 y 2021, fechas en las que
// ninguna otra prueba crea órdenes ni consultas, así que los totales son exactos.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import {
  semillaAdmin,
  semillaCatalogo,
  semillaCategorias,
  URL_LOCAL,
} from '../scripts/semillas.ts';

const bd = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const servidor = createTestHarness({
  root: join(import.meta.dirname, '..'),
  workers: [{ configPath: './wrangler.jsonc', vars: { COOKIE_DOMAIN: '' } }],
});

const id = (n: number) => `0195a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const X = id(1); // 2 unidades a S/ 300 (S/ 600)
const Y = id(2); // 1 a S/ 400 + 1 a S/ 500 (S/ 900): empata en unidades y gana por importe

const correos: string[] = [];
let admin = '';
let cliente = '';
let comprador = '';

const ip = () => `10.82.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
async function sesion(correo: string, contrasena: string): Promise<string> {
  const res = await servidor.fetch('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip() },
    body: JSON.stringify({ correo, contrasena }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

const pedir = (ruta: string, cookie = admin) => servidor.fetch(ruta, { headers: { cookie } });

async function orden(creada: string, total: string, items: [string, number, string][]) {
  const reserva = randomUUID();
  const ordenId = randomUUID();
  await bd.query(
    `INSERT INTO reservas (id, usuario_id, estado, vence_en, creada_en)
     VALUES ($1, $2, 'CONFIRMADA', $3, $3)`,
    [reserva, comprador, creada],
  );
  await bd.query(
    `INSERT INTO ordenes (id, usuario_id, reserva_id, clave_idempotencia, total, creada_en)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ordenId, comprador, reserva, `reporte-${ordenId}`, total, creada],
  );
  for (const [producto, cantidad, precio] of items) {
    await bd.query(
      `INSERT INTO orden_items (id, orden_id, producto_id, cantidad, precio_unitario)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), ordenId, producto, cantidad, precio],
    );
  }
}

async function consulta(
  creado: string,
  latencia: number,
  respaldo: boolean,
  tokens: [number, number],
  motivo: string | null = null,
) {
  await bd.query(
    `INSERT INTO uso_asistente (id, usuario_id, presupuesto, uso, resultado, latencia_ms, uso_respaldo, creado_en)
     VALUES ($1, $2, 5000, 'GAMING', $3, $4, $5, $6)`,
    [
      randomUUID(),
      comprador,
      JSON.stringify({ motivo, tokens: { entrada: tokens[0], salida: tokens[1] } }),
      latencia,
      respaldo,
      creado,
    ],
  );
}

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  await semillaCategorias(bd);
  await semillaCatalogo(bd);
  const correoAdmin = `admin-reportes-${randomUUID()}@prueba.local`;
  const correoCliente = `cliente-reportes-${randomUUID()}@prueba.local`;
  const correoComprador = `comprador-reportes-${randomUUID()}@prueba.local`;
  correos.push(correoAdmin, correoCliente, correoComprador);
  await semillaAdmin(bd, correoAdmin, 'clave-admin-reportes-1');
  const reg = await servidor.fetch('/auth/registro', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip() },
    body: JSON.stringify({ correo: correoCliente, contrasena: 'clave-cliente-reportes-1' }),
  });
  expect(reg.status).toBe(201);
  admin = await sesion(correoAdmin, 'clave-admin-reportes-1');
  cliente = await sesion(correoCliente, 'clave-cliente-reportes-1');
  comprador = (
    await bd.query(
      `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en)
       VALUES ($1, $2, 'sin-acceso', now()) RETURNING id`,
      [randomUUID(), correoComprador],
    )
  ).rows[0].id;

  // Ventas de marzo de 2020 (hora de Lima).
  await orden('2020-03-02T15:00:00-05:00', '1000.00', [
    [X, 2, '300.00'],
    [Y, 1, '400.00'],
  ]);
  await orden('2020-03-05T10:00:00-05:00', '500.00', [[Y, 1, '500.00']]);
  // Al borde del día: 23:30 de Lima del 10 de marzo (04:30 UTC del 11).
  await orden('2020-03-10T23:30:00-05:00', '100.00', [[X, 1, '100.00']]);

  // Consultas al asistente de mayo de 2021: 4 de GAMING, 1 con respaldo por IA_TIMEOUT.
  await consulta('2021-05-03T12:00:00-05:00', 10_000, false, [1000, 400]);
  await consulta('2021-05-03T13:00:00-05:00', 12_000, false, [1038, 400]);
  await consulta('2021-05-04T12:00:00-05:00', 14_000, false, [1000, 367]);
  await consulta('2021-05-05T12:00:00-05:00', 4_000, true, [0, 0], 'IA_TIMEOUT');
});

afterAll(async () => {
  if (comprador) {
    await bd.query('DELETE FROM ordenes WHERE usuario_id = $1', [comprador]);
    await bd.query('DELETE FROM reservas WHERE usuario_id = $1', [comprador]);
  }
  await bd.query('DELETE FROM usuarios WHERE correo = ANY($1)', [correos]);
  await servidor.close();
  await bd.end();
});

interface Ventas {
  rango: { desde: string; hasta: string };
  totalVendido: string;
  ordenes: number;
  ticketPromedio: string;
  productos: { productoId: string; unidades: number; importe: string }[];
  serie: { fecha: string; total: string; ordenes: number }[];
}

describe('GET /admin/reportes/ventas', () => {
  it('totales, ticket promedio, top con desempate por importe y serie con días en cero', async () => {
    const res = await pedir('/admin/reportes/ventas?desde=2020-03-01&hasta=2020-03-07');
    expect(res.status).toBe(200);
    const r = (await res.json()) as Ventas;
    expect(r.rango).toEqual({ desde: '2020-03-01', hasta: '2020-03-07' });
    expect([r.totalVendido, r.ordenes, r.ticketPromedio]).toEqual(['1500.00', 2, '750.00']);
    expect(r.productos.map((p) => [p.productoId, p.unidades, p.importe])).toEqual([
      [Y, 2, '900.00'],
      [X, 2, '600.00'],
    ]);
    expect(r.serie).toHaveLength(7);
    expect(r.serie.filter((d) => d.ordenes === 0)).toHaveLength(5);
    expect(r.serie.find((d) => d.fecha === '2020-03-02')).toEqual({
      fecha: '2020-03-02',
      total: '1000.00',
      ordenes: 1,
    });
    expect(r.serie.find((d) => d.fecha === '2020-03-03')!.total).toBe('0.00');
  });

  it('una orden a las 23:30 de Lima cuenta en su día y no en el siguiente', async () => {
    const dia10 = (await (
      await pedir('/admin/reportes/ventas?desde=2020-03-10&hasta=2020-03-10')
    ).json()) as Ventas;
    expect([dia10.ordenes, dia10.totalVendido]).toEqual([1, '100.00']);
    const dia11 = (await (
      await pedir('/admin/reportes/ventas?desde=2020-03-11&hasta=2020-03-11')
    ).json()) as Ventas;
    expect(dia11.ordenes).toBe(0);
  });

  it('un rango sin órdenes devuelve ceros', async () => {
    const r = (await (
      await pedir('/admin/reportes/ventas?desde=2020-01-01&hasta=2020-01-31')
    ).json()) as Ventas;
    expect([r.totalVendido, r.ordenes, r.ticketPromedio, r.productos]).toEqual([
      '0.00',
      0,
      '0.00',
      [],
    ]);
    expect(r.serie).toHaveLength(31);
  });

  it('sin parámetros aplica los últimos 30 días', async () => {
    const r = (await (await pedir('/admin/reportes/ventas')).json()) as Ventas;
    expect(r.serie).toHaveLength(30);
    expect(r.rango.hasta).toBe(r.serie[29]!.fecha);
  });

  it('un rango inválido responde 400 SOLICITUD_INVALIDA', async () => {
    for (const q of [
      'desde=2020-03-20&hasta=2020-03-01',
      'desde=2019-01-01&hasta=2020-03-01',
      'desde=2020-02-30',
      'desde=ayer',
    ]) {
      const res = await pedir(`/admin/reportes/ventas?${q}`);
      expect(res.status, q).toBe(400);
      expect(((await res.json()) as { codigo: string }).codigo).toBe('SOLICITUD_INVALIDA');
    }
  });

  it('un CLIENTE recibe 403', async () => {
    expect((await pedir('/admin/reportes/ventas', cliente)).status).toBe(403);
  });
});

interface Asistente {
  consultas: number;
  conRespaldo: number;
  porcentajeRespaldo: number;
  latenciaPromedioMs: number;
  porUso: { uso: string; consultas: number; porcentajeRespaldo: number }[];
  motivos: { motivo: string; consultas: number }[];
  tokens: { entrada: number; salida: number };
  costoEstimadoUsd: number;
}

describe('GET /admin/reportes/asistente', () => {
  it('conteos, respaldo, latencia, usos, motivos y costo estimado', async () => {
    const res = await pedir('/admin/reportes/asistente?desde=2021-05-01&hasta=2021-05-07');
    expect(res.status).toBe(200);
    const r = (await res.json()) as Asistente;
    expect([r.consultas, r.conRespaldo, r.porcentajeRespaldo, r.latenciaPromedioMs]).toEqual([
      4, 1, 25, 10_000,
    ]);
    expect(r.porUso.map((u) => u.uso)).toEqual(['OFICINA', 'ESTUDIO', 'GAMING', 'DISENO', 'OTRO']);
    expect(r.porUso.find((u) => u.uso === 'GAMING')).toEqual({
      uso: 'GAMING',
      consultas: 4,
      porcentajeRespaldo: 25,
    });
    expect(r.porUso.find((u) => u.uso === 'OFICINA')).toEqual({
      uso: 'OFICINA',
      consultas: 0,
      porcentajeRespaldo: 0,
    });
    expect(r.motivos).toEqual([{ motivo: 'IA_TIMEOUT', consultas: 1 }]);
    expect(r.tokens).toEqual({ entrada: 3038, salida: 1167 });
    expect(r.costoEstimadoUsd).toBe(0.0355);
  });

  it('un rango sin consultas devuelve ceros sin dividir entre cero', async () => {
    const r = (await (
      await pedir('/admin/reportes/asistente?desde=2021-06-01&hasta=2021-06-30')
    ).json()) as Asistente;
    expect([r.consultas, r.porcentajeRespaldo, r.latenciaPromedioMs, r.costoEstimadoUsd]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(r.porUso.every((u) => u.consultas === 0 && u.porcentajeRespaldo === 0)).toBe(true);
    expect(r.motivos).toEqual([]);
  });

  it('un CLIENTE recibe 403 y un rango inválido 400', async () => {
    expect((await pedir('/admin/reportes/asistente', cliente)).status).toBe(403);
    expect((await pedir('/admin/reportes/asistente?desde=2021-13-01')).status).toBe(400);
  });
});
