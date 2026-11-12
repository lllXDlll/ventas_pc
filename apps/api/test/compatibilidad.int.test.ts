// Validación de compatibilidad y configuraciones (specs motor-compatibilidad y
// configuraciones; tareas 3.1 y 3.2 del Sprint 2) contra el Worker empaquetado, el
// Postgres local y el catálogo de ejemplo (UUID fijos de la semilla).
import { randomUUID } from 'node:crypto';
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

const id = (n: number) => `0195a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const P = {
  ryzen5: id(1), // AM5, 65 W
  i5: id(3), // LGA1700
  i7Agotado: id(4), // LGA1700, stock 0
  b650: id(10), // AM5, DDR5 hasta 6400, ATX, 4 módulos
  b760: id(11), // LGA1700, DDR4, mATX
  ddr5: id(20), // 6000 MHz, 2 módulos
  ddr4: id(21),
  rtx4060: id(30),
  fuente550: id(40),
  lancool: id(50), // ATX
  q300l: id(51), // mATX, ITX
  nvme: id(60),
  equipo: id(70),
};

const correos: string[] = [];
const ip = () => `10.79.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function nuevaSesion(): Promise<string> {
  const correo = `config-${randomUUID()}@prueba.local`;
  correos.push(correo);
  const cabeceras = { 'content-type': 'application/json', 'cf-connecting-ip': ip() };
  const cuerpo = JSON.stringify({ correo, contrasena: 'clave-config-1' });
  expect(
    (await servidor.fetch('/auth/registro', { method: 'POST', headers: cabeceras, body: cuerpo }))
      .status,
  ).toBe(201);
  const res = await servidor.fetch('/auth/login', {
    method: 'POST',
    headers: cabeceras,
    body: cuerpo,
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

let ana = '';
let beto = '';

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  await semillaCategorias(bd);
  await semillaReglas(bd);
  await semillaCatalogo(bd);
  ana = await nuevaSesion();
  beto = await nuevaSesion();
});

afterAll(async () => {
  await bd.query('DELETE FROM usuarios WHERE correo = ANY($1)', [correos]);
  await servidor.close();
  await bd.end();
});

const items = (...pares: [string, number?][]) =>
  pares.map(([productoId, cantidad = 1]) => ({ productoId, cantidad }));

function enviar(metodo: string, ruta: string, cuerpo?: unknown, cookie = '') {
  return servidor.fetch(ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

const validar = (lista: ReturnType<typeof items>) =>
  enviar('POST', '/compatibilidad/validar', { items: lista });

interface Respuesta {
  compatible: boolean;
  rechazos: { codigo: string; mensaje: string; productos: string[] }[];
}
interface Vista extends Respuesta {
  id: string;
  origen: string;
  estado: string;
  total: string;
  agregable: boolean;
  faltantes: { productoId: string; disponible: number; cantidad: number }[];
  items: { producto: { id: string }; cantidad: number }[];
}

describe('POST /compatibilidad/validar (público)', () => {
  it('configuración compatible: sin rechazos', async () => {
    const res = await validar(
      items([P.ryzen5], [P.b650], [P.ddr5], [P.rtx4060], [P.fuente550], [P.lancool], [P.nvme]),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ compatible: true, rechazos: [] });
  });

  it('procesador LGA1700 con placa AM5: rechazo SOCKET con mensaje que nombra el conflicto', async () => {
    const cuerpo = (await (await validar(items([P.i5], [P.b650]))).json()) as Respuesta;
    expect(cuerpo.compatible).toBe(false);
    expect(cuerpo.rechazos).toHaveLength(1);
    expect(cuerpo.rechazos[0]).toMatchObject({ codigo: 'SOCKET', productos: [P.i5, P.b650] });
    for (const t of ['Intel Core i5-14400F', 'MSI B650', 'LGA1700', 'AM5']) {
      expect(cuerpo.rechazos[0]?.mensaje).toContain(t);
    }
  });

  it('varias reglas a la vez: RAM y FACTOR_FORMA', async () => {
    const cuerpo = (await (
      await validar(items([P.b650], [P.ddr4], [P.q300l]))
    ).json()) as Respuesta;
    expect(cuerpo.rechazos.map((r) => r.codigo)).toEqual(['RAM', 'FACTOR_FORMA']);
  });

  it('una pieza suelta es compatible y una lista vacía también', async () => {
    expect(((await (await validar(items([P.i5]))).json()) as Respuesta).compatible).toBe(true);
    expect(((await (await validar([])).json()) as Respuesta).compatible).toBe(true);
  });

  it('400: equipo armado, inexistente, dos procesadores, cantidad fuera de rango, repetido', async () => {
    for (const lista of [
      items([P.equipo]),
      items([randomUUID()]),
      items([P.ryzen5], [P.i5]),
      items([P.ddr5, 9]),
      items([P.ryzen5, 2]),
      items([P.ddr5], [P.ddr5]),
    ]) {
      const res = await validar(lista);
      expect(res.status, JSON.stringify(lista)).toBe(400);
    }
    expect((await enviar('POST', '/compatibilidad/validar', { items: 'x' })).status).toBe(400);
  });

  it('400: producto inactivo', async () => {
    const { rows } = await bd.query<{ id: string }>(
      `INSERT INTO productos (id, nombre, marca, categoria_id, tipo, precio, activo, atributos, actualizado_en)
       SELECT $1, 'RAM inactiva', 'X', id, 'COMPONENTE', 10, false,
              '{"tipoRam":"DDR5","velocidadRam":4800,"modulos":1}', now()
         FROM categorias WHERE codigo = 'RAM' RETURNING id`,
      [randomUUID()],
    );
    try {
      expect((await validar(items([rows[0]!.id]))).status).toBe(400);
    } finally {
      await bd.query('DELETE FROM productos WHERE id = $1', [rows[0]!.id]);
    }
  });
});

describe('configuraciones (con sesión)', () => {
  it('sin sesión: 401 y no guarda', async () => {
    expect((await enviar('POST', '/configuraciones', { items: items([P.ryzen5]) })).status).toBe(
      401,
    );
    expect((await enviar('GET', '/configuraciones')).status).toBe(401);
  });

  it('guarda con origen MANUAL; incompatible queda INVALIDA con el rechazo; PATCH la corrige', async () => {
    const res = await enviar('POST', '/configuraciones', { items: items([P.i5], [P.b650]) }, ana);
    expect(res.status).toBe(201);
    const creada = (await res.json()) as Vista;
    expect(creada).toMatchObject({ origen: 'MANUAL', estado: 'INVALIDA', agregable: false });
    expect(creada.rechazos.map((r) => r.codigo)).toEqual(['SOCKET']);

    const patch = await enviar(
      'PATCH',
      `/configuraciones/${creada.id}`,
      { items: items([P.i5], [P.b760]) },
      ana,
    );
    expect(patch.status).toBe(200);
    expect((await patch.json()) as Vista).toMatchObject({
      estado: 'VALIDA',
      compatible: true,
      agregable: true,
    });

    const { rows } = await bd.query(
      'SELECT estado::text AS estado FROM configuraciones WHERE id = $1',
      [creada.id],
    );
    expect(rows[0]?.estado).toBe('VALIDA');
  });

  it('el total suma precio por cantidad', async () => {
    const res = await enviar(
      'POST',
      '/configuraciones',
      { items: items([P.ddr5, 2], [P.nvme]) },
      ana,
    );
    const v = (await res.json()) as Vista;
    const precios = await bd.query<{ id: string; precio: string }>(
      'SELECT id, precio::text FROM productos WHERE id = ANY($1)',
      [[P.ddr5, P.nvme]],
    );
    const precio = (pid: string) => Number(precios.rows.find((r) => r.id === pid)?.precio);
    expect(Number(v.total)).toBeCloseTo(precio(P.ddr5) * 2 + precio(P.nvme), 2);
  });

  it('composición inválida: 400 y no guarda', async () => {
    const antes = await bd.query('SELECT count(*) FROM configuraciones');
    const res = await enviar('POST', '/configuraciones', { items: items([P.ryzen5], [P.i5]) }, ana);
    expect(res.status).toBe(400);
    expect((await bd.query('SELECT count(*) FROM configuraciones')).rows[0]).toEqual(antes.rows[0]);
  });

  it('producto agotado: no es agregable y se informa en faltantes', async () => {
    const res = await enviar('POST', '/configuraciones', { items: items([P.i7Agotado]) }, ana);
    const v = (await res.json()) as Vista;
    expect(v).toMatchObject({ compatible: true, agregable: false });
    expect(v.faltantes).toEqual([{ productoId: P.i7Agotado, disponible: 0, cantidad: 1 }]);
    const leida = (await (
      await enviar('GET', `/configuraciones/${v.id}`, undefined, ana)
    ).json()) as Vista;
    expect(leida.agregable).toBe(false);
  });

  it('la configuración de otro usuario responde 404 al leerla o modificarla', async () => {
    const v = (await (
      await enviar('POST', '/configuraciones', { items: items([P.ryzen5]) }, ana)
    ).json()) as Vista;
    expect((await enviar('GET', `/configuraciones/${v.id}`, undefined, beto)).status).toBe(404);
    const patch = await enviar('PATCH', `/configuraciones/${v.id}`, { items: items([P.i5]) }, beto);
    expect(patch.status).toBe(404);
    const propia = (await (
      await enviar('GET', `/configuraciones/${v.id}`, undefined, ana)
    ).json()) as Vista;
    expect(propia.items.map((i) => i.producto.id)).toEqual([P.ryzen5]);
    expect((await enviar('GET', '/configuraciones/no-es-uuid', undefined, ana)).status).toBe(404);
  });

  it('GET recalcula con el catálogo actual sin reescribir el estado', async () => {
    const v = (await (
      await enviar('POST', '/configuraciones', { items: items([P.ryzen5], [P.b650]) }, ana)
    ).json()) as Vista;
    expect(v.estado).toBe('VALIDA');
    await bd.query(`UPDATE reglas_compatibilidad SET activa = true WHERE codigo = 'SOCKET'`);
    await bd.query(
      `UPDATE productos SET atributos = atributos || '{"socket":"AM4"}' WHERE id = $1`,
      [P.b650],
    );
    try {
      const leida = (await (
        await enviar('GET', `/configuraciones/${v.id}`, undefined, ana)
      ).json()) as Vista;
      expect(leida.estado).toBe('VALIDA');
      expect(leida.rechazos.map((r) => r.codigo)).toEqual(['SOCKET']);
      expect(leida.agregable).toBe(false);
    } finally {
      await bd.query(
        `UPDATE productos SET atributos = atributos || '{"socket":"AM5"}' WHERE id = $1`,
        [P.b650],
      );
    }
  });

  it('GET /configuraciones lista solo las propias, la más reciente primero', async () => {
    const carla = await nuevaSesion();
    const a = (await (
      await enviar('POST', '/configuraciones', { items: items([P.ryzen5]) }, carla)
    ).json()) as Vista;
    const b = (await (
      await enviar('POST', '/configuraciones', { items: items([P.nvme]) }, carla)
    ).json()) as Vista;
    const res = await enviar('GET', '/configuraciones', undefined, carla);
    expect(res.status).toBe(200);
    const lista = (await res.json()) as { configuraciones: { id: string }[]; total: number };
    expect(lista.total).toBe(2);
    expect(lista.configuraciones.map((c) => c.id)).toEqual([b.id, a.id]);
    expect((await enviar('GET', '/configuraciones?pagina=0', undefined, carla)).status).toBe(400);
  });
});
