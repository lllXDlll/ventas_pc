// Gestión de reglas (spec gestion-reglas; tareas 1.2 y 1.3 del Sprint 6) contra el Worker
// empaquetado y el Postgres local. Las reglas son globales: cada prueba que las cambia las
// restablece en afterEach (la integración corre un archivo a la vez).
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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

const id = (n: number) => `0195a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const P = {
  ryzen7: id(2), // AM5, 120 W
  b650: id(10), // AM5
  b760: id(11), // LGA1700
  rx7800: id(31), // 263 W
  fuente550: id(40),
};

const correos: string[] = [];
let admin = '';
let cliente = '';

const ip = () => `10.81.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
async function sesion(correo: string, contrasena: string): Promise<string> {
  const res = await servidor.fetch('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip() },
    body: JSON.stringify({ correo, contrasena }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

function enviar(metodo: string, ruta: string, cuerpo?: unknown, cookie = admin) {
  return servidor.fetch(ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', cookie },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

async function restablecer() {
  await bd.query(
    `UPDATE reglas_compatibilidad SET activa = true,
       parametros = CASE WHEN codigo = 'POTENCIA'
         THEN '{"margenPorcentaje": 20, "consumoBaseW": 0}'::jsonb ELSE '{}'::jsonb END`,
  );
}

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  await semillaCategorias(bd);
  await semillaReglas(bd);
  await semillaCatalogo(bd);
  await restablecer();
  const correoAdmin = `admin-reglas-${randomUUID()}@prueba.local`;
  const correoCliente = `cliente-reglas-${randomUUID()}@prueba.local`;
  correos.push(correoAdmin, correoCliente);
  await semillaAdmin(bd, correoAdmin, 'clave-admin-reglas-1');
  const reg = await servidor.fetch('/auth/registro', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip() },
    body: JSON.stringify({ correo: correoCliente, contrasena: 'clave-cliente-reglas-1' }),
  });
  expect(reg.status).toBe(201);
  admin = await sesion(correoAdmin, 'clave-admin-reglas-1');
  cliente = await sesion(correoCliente, 'clave-cliente-reglas-1');
});

afterEach(restablecer);

afterAll(async () => {
  await bd.query('DELETE FROM usuarios WHERE correo = ANY($1)', [correos]);
  await servidor.close();
  await bd.end();
});

interface Regla {
  codigo: string;
  activa: boolean;
  parametros: Record<string, number>;
  descripcion: { nombre: string; min: number; max: number; unidad: string }[];
}

describe('GET /admin/reglas', () => {
  it('lista las seis reglas con la descripción de los parámetros de POTENCIA', async () => {
    const res = await enviar('GET', '/admin/reglas');
    expect(res.status).toBe(200);
    const reglas = (await res.json()) as Regla[];
    expect(reglas.map((r) => r.codigo)).toEqual([
      'SOCKET',
      'RAM',
      'POTENCIA',
      'DIMENSIONES',
      'FACTOR_FORMA',
      'ALMACENAMIENTO',
    ]);
    const potencia = reglas.find((r) => r.codigo === 'POTENCIA')!;
    expect(potencia.parametros).toEqual({ margenPorcentaje: 20, consumoBaseW: 0 });
    expect(potencia.descripcion.map((d) => [d.nombre, d.min, d.max])).toEqual([
      ['margenPorcentaje', 0, 100],
      ['consumoBaseW', 0, 500],
    ]);
  });

  it('un CLIENTE recibe 403 SIN_PERMISO en lectura y edición', async () => {
    const lectura = await enviar('GET', '/admin/reglas', undefined, cliente);
    expect(lectura.status).toBe(403);
    expect(((await lectura.json()) as { codigo: string }).codigo).toBe('SIN_PERMISO');
    expect((await enviar('PATCH', '/admin/reglas/SOCKET', { activa: false }, cliente)).status).toBe(
      403,
    );
  });
});

describe('PATCH /admin/reglas/:codigo', () => {
  it('desactiva SOCKET y la lectura siguiente lo refleja', async () => {
    const res = await enviar('PATCH', '/admin/reglas/SOCKET', { activa: false });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Regla).activa).toBe(false);
    const reglas = (await (await enviar('GET', '/admin/reglas')).json()) as Regla[];
    expect(reglas.find((r) => r.codigo === 'SOCKET')!.activa).toBe(false);
  });

  it('cambia el margen y el consumo base de POTENCIA', async () => {
    const res = await enviar('PATCH', '/admin/reglas/POTENCIA', {
      parametros: { margenPorcentaje: 30, consumoBaseW: 50 },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Regla).parametros).toEqual({
      margenPorcentaje: 30,
      consumoBaseW: 50,
    });
  });

  it('un margen fuera de rango responde 400 PARAMETROS_INVALIDOS y no cambia nada', async () => {
    const res = await enviar('PATCH', '/admin/reglas/POTENCIA', {
      parametros: { margenPorcentaje: 150, consumoBaseW: 0 },
    });
    expect(res.status).toBe(400);
    const cuerpo = (await res.json()) as { codigo: string; mensaje: string };
    expect(cuerpo.codigo).toBe('PARAMETROS_INVALIDOS');
    expect(cuerpo.mensaje).toContain('margenPorcentaje');
    const { rows } = await bd.query(
      `SELECT parametros FROM reglas_compatibilidad WHERE codigo = 'POTENCIA'`,
    );
    expect(rows[0].parametros.margenPorcentaje).toBe(20);
  });

  it('rechaza un valor no numérico y una clave desconocida', async () => {
    const cadena = await enviar('PATCH', '/admin/reglas/POTENCIA', {
      parametros: { margenPorcentaje: '20', consumoBaseW: 0 },
    });
    expect(cadena.status).toBe(400);
    const desconocida = await enviar('PATCH', '/admin/reglas/SOCKET', {
      parametros: { tolerancia: 2 },
    });
    expect(desconocida.status).toBe(400);
    const cuerpo = (await desconocida.json()) as { codigo: string; mensaje: string };
    expect(cuerpo.codigo).toBe('PARAMETROS_INVALIDOS');
    expect(cuerpo.mensaje).toMatch(/SOCKET.*tolerancia/);
  });

  it('una regla inexistente responde 404 y un campo extra 400', async () => {
    expect((await enviar('PATCH', '/admin/reglas/COLOR', { activa: false })).status).toBe(404);
    expect((await enviar('PATCH', '/admin/reglas/SOCKET', { otra: 1 })).status).toBe(400);
  });
});

describe('los cambios aplican a la siguiente validación', () => {
  const validar = async (...ids: string[]) =>
    (await (
      await enviar('POST', '/compatibilidad/validar', {
        items: ids.map((productoId) => ({ productoId, cantidad: 1 })),
      })
    ).json()) as { rechazos: { codigo: string }[] };
  const codigos = (r: { rechazos: { codigo: string }[] }) => r.rechazos.map((x) => x.codigo);

  it('un margen de 60 % hace que la fuente de 550 W no alcance', async () => {
    const config = [P.ryzen7, P.b650, P.rx7800, P.fuente550];
    expect(codigos(await validar(...config))).not.toContain('POTENCIA'); // 383 W + 20 % = 460 W
    await enviar('PATCH', '/admin/reglas/POTENCIA', {
      parametros: { margenPorcentaje: 60, consumoBaseW: 0 },
    });
    expect(codigos(await validar(...config))).toContain('POTENCIA'); // 383 W + 60 % = 613 W
  });

  it('con SOCKET desactivada, AM5 con LGA1700 no se rechaza por socket', async () => {
    expect(codigos(await validar(P.ryzen7, P.b760))).toContain('SOCKET');
    await enviar('PATCH', '/admin/reglas/SOCKET', { activa: false });
    expect(codigos(await validar(P.ryzen7, P.b760))).not.toContain('SOCKET');
  });
});
