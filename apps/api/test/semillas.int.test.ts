// Semillas idempotentes (design.md D11 del Sprint 1) contra el Postgres local o de la CI.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CATALOGO_EJEMPLO,
  semillaAdmin,
  semillaCatalogo,
  semillaCategorias,
  URL_LOCAL,
} from '../scripts/semillas.ts';
import { verificarContrasena } from '../src/auth/contrasenas';
import { validarAtributos, validarTipo, tipoDeCategoria } from '../src/catalogo/atributos';

const cliente = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const CORREO_ADMIN = `admin-semilla-${Date.now()}@prueba.local`;

beforeAll(() => cliente.connect());
afterAll(async () => {
  await cliente.query('DELETE FROM usuarios WHERE correo = $1', [CORREO_ADMIN]);
  await cliente.end();
});

async function contar(tabla: 'categorias' | 'productos' | 'stock'): Promise<number> {
  const { rows } = await cliente.query<{ n: string }>(`SELECT count(*) AS n FROM ${tabla}`);
  return Number(rows[0]?.n);
}

describe('semillas', () => {
  it('categorías: dos ejecuciones dejan las mismas ocho', async () => {
    await semillaCategorias(cliente);
    const primera = await contar('categorias');
    await semillaCategorias(cliente);
    expect(await contar('categorias')).toBe(primera);
    const { rows } = await cliente.query<{ codigo: string }>('SELECT codigo FROM categorias');
    expect(rows.map((r) => r.codigo).sort()).toEqual(
      [
        'ALMACENAMIENTO',
        'EQUIPO_ARMADO',
        'FUENTE',
        'GABINETE',
        'PLACA_MADRE',
        'PROCESADOR',
        'RAM',
        'TARJETA_GRAFICA',
      ].sort(),
    );
  });

  it('catálogo: dos ejecuciones no duplican productos ni stock', async () => {
    await semillaCategorias(cliente);
    await semillaCatalogo(cliente);
    const productos = await contar('productos');
    const stock = await contar('stock');
    await semillaCatalogo(cliente);
    expect(await contar('productos')).toBe(productos);
    expect(await contar('stock')).toBe(stock);

    const ids = CATALOGO_EJEMPLO.map((p) => p.id);
    const { rows } = await cliente.query<{ n: string }>(
      'SELECT count(*) AS n FROM productos p JOIN stock s ON s.producto_id = p.id WHERE p.id = ANY($1)',
      [ids],
    );
    expect(Number(rows[0]?.n)).toBe(ids.length);
  });

  it('catálogo: completa la marca de los productos que no la tenían, sin pisar las editadas', async () => {
    await semillaCategorias(cliente);
    await semillaCatalogo(cliente);
    const ids = CATALOGO_EJEMPLO.map((p) => p.id);
    const [vaciado, editado] = ids;
    const { rows: antes } = await cliente.query<{ marca: string }>(
      'SELECT marca FROM productos WHERE id = $1',
      [editado],
    );
    try {
      // Como en una base del Sprint 1: sin marca. Y uno editado por un ADMIN.
      await cliente.query('UPDATE productos SET marca = NULL WHERE id = $1', [vaciado]);
      await cliente.query(`UPDATE productos SET marca = 'Editada' WHERE id = $1`, [editado]);
      await semillaCatalogo(cliente);
      const { rows } = await cliente.query<{ id: string; marca: string | null }>(
        'SELECT id, marca FROM productos WHERE id = ANY($1)',
        [ids],
      );
      expect(rows).toHaveLength(ids.length);
      expect(rows.filter((r) => !r.marca)).toEqual([]);
      const marca = (i: string | undefined) => rows.find((r) => r.id === i)?.marca;
      expect(marca(vaciado)).toBe(CATALOGO_EJEMPLO[0]?.marca);
      expect(marca(editado)).toBe('Editada');
    } finally {
      await cliente.query('UPDATE productos SET marca = $2 WHERE id = $1', [
        editado,
        antes[0]?.marca ?? CATALOGO_EJEMPLO[1]?.marca,
      ]);
    }
  });

  it('el catálogo de ejemplo cubre lo que pide la spec y tiene atributos válidos', () => {
    for (const p of CATALOGO_EJEMPLO) {
      expect(validarAtributos(p.categoria, p.atributos), p.nombre).toBeNull();
      expect(validarTipo(p.categoria, tipoDeCategoria(p.categoria)), p.nombre).toBeNull();
    }
    const de = (c: string) => CATALOGO_EJEMPLO.filter((p) => p.categoria === c);
    const distintos = (c: string, a: string) =>
      new Set(de(c).map((p) => JSON.stringify(p.atributos[a]))).size;
    expect(new Set(CATALOGO_EJEMPLO.map((p) => p.categoria)).size).toBe(8);
    expect(distintos('PROCESADOR', 'socket')).toBeGreaterThanOrEqual(2);
    expect(distintos('RAM', 'tipoRam')).toBeGreaterThanOrEqual(2);
    expect(distintos('FUENTE', 'potenciaEntregadaW')).toBeGreaterThanOrEqual(2);
    expect(distintos('GABINETE', 'factoresFormaSoportados')).toBeGreaterThanOrEqual(2);
    expect(de('EQUIPO_ARMADO').length).toBeGreaterThanOrEqual(1);
    expect(CATALOGO_EJEMPLO.every((p) => p.marca.trim().length > 0)).toBe(true);
    expect(new Set(de('PROCESADOR').map((p) => p.marca)).size).toBeGreaterThanOrEqual(2);
  });

  it('administrador: idempotente, rol ADMIN y hash que la verificación acepta', async () => {
    await semillaAdmin(cliente, CORREO_ADMIN, 'clave-admin-segura-1');
    await semillaAdmin(cliente, CORREO_ADMIN.toUpperCase(), 'clave-admin-segura-2');
    const { rows } = await cliente.query<{ rol: string; estado: string; hash_contrasena: string }>(
      'SELECT rol, estado, hash_contrasena FROM usuarios WHERE correo = $1',
      [CORREO_ADMIN],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rol).toBe('ADMIN');
    expect(rows[0]?.estado).toBe('ACTIVO');
    expect(rows[0]?.hash_contrasena).toMatch(/^pbkdf2\$50000\$/);
    expect(await verificarContrasena('clave-admin-segura-2', rows[0]?.hash_contrasena ?? '')).toBe(
      true,
    );
  });

  it('administrador: rechaza credenciales débiles o un correo inválido', async () => {
    await expect(semillaAdmin(cliente, 'no-es-correo', 'clave-admin-segura-1')).rejects.toThrow();
    await expect(semillaAdmin(cliente, CORREO_ADMIN, 'corta')).rejects.toThrow(/12 caracteres/);
  });
});
