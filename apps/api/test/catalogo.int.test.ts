// Catálogo administrable y público (spec catalogo y autorizacion-roles) contra el Worker
// empaquetado y el Postgres local. Los productos de prueba usan precios de 77.000 a 77.999
// para no mezclarse con el catálogo de ejemplo.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import { semillaAdmin, semillaCategorias, URL_LOCAL } from '../scripts/semillas.ts';

const bd = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const servidor = createTestHarness({
  root: join(import.meta.dirname, '..'),
  workers: [{ configPath: './wrangler.jsonc', vars: { COOKIE_DOMAIN: '' } }],
});

const correos: string[] = [];
const productos: string[] = [];
let admin = '';
let cliente = '';

const ip = () => `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
async function sesion(correo: string, contrasena: string): Promise<string> {
  const res = await servidor.fetch('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip() },
    body: JSON.stringify({ correo, contrasena }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  await semillaCategorias(bd);
  const correoAdmin = `admin-${randomUUID()}@prueba.local`;
  const correoCliente = `cliente-${randomUUID()}@prueba.local`;
  correos.push(correoAdmin, correoCliente);
  await semillaAdmin(bd, correoAdmin, 'clave-admin-segura-1');
  const reg = await servidor.fetch('/auth/registro', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip() },
    body: JSON.stringify({ correo: correoCliente, contrasena: 'clave-cliente-1' }),
  });
  expect(reg.status).toBe(201);
  admin = await sesion(correoAdmin, 'clave-admin-segura-1');
  cliente = await sesion(correoCliente, 'clave-cliente-1');
});

afterAll(async () => {
  if (productos.length) await bd.query('DELETE FROM productos WHERE id = ANY($1)', [productos]);
  await bd.query('DELETE FROM usuarios WHERE correo = ANY($1)', [correos]);
  await servidor.close();
  await bd.end();
});

function enviar(metodo: string, ruta: string, cuerpo?: unknown, cookie = admin) {
  return servidor.fetch(ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

interface Producto {
  id: string;
  nombre: string;
  marca: string | null;
  imagenUrl: string | null;
  precio: string;
  disponible: number;
  agotado: boolean;
  stock?: { cantidad: number; version: number };
  categoria: { codigo: string };
  atributos: Record<string, unknown>;
}

let precioSiguiente = 77_000;
async function crear(extra: Record<string, unknown> = {}): Promise<Producto> {
  const res = await enviar('POST', '/admin/productos', {
    nombre: `Fuente de prueba ${randomUUID()}`,
    marca: 'Marca de prueba',
    categoria: 'FUENTE',
    tipo: 'COMPONENTE',
    precio: `${precioSiguiente++}.50`,
    stockInicial: 10,
    atributos: { potenciaEntregadaW: 650 },
    ...extra,
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const producto = (await res.json()) as Producto;
  productos.push(producto.id);
  return producto;
}

describe('categorías', () => {
  it('GET /categorias lista las ocho sin sesión', async () => {
    const res = await servidor.fetch('/categorias');
    expect(res.status).toBe(200);
    expect(((await res.json()) as unknown[]).length).toBe(8);
  });
});

describe('alta y actualización (ADMIN)', () => {
  it('crea un componente con su stock en versión 0', async () => {
    const p = await crear({ stockInicial: 10 });
    expect(p.stock).toEqual({ cantidad: 10, version: 0 });
    expect(p.disponible).toBe(10);
    expect(p.precio).toMatch(/^\d+\.50$/);
  });

  it('crea un equipo armado como producto propio con su stock', async () => {
    const res = await enviar('POST', '/admin/productos', {
      nombre: `Equipo de prueba ${randomUUID()}`,
      marca: 'Marca de prueba',
      categoria: 'EQUIPO_ARMADO',
      tipo: 'EQUIPO',
      precio: '77999.00',
      stockInicial: 3,
      atributos: {},
    });
    expect(res.status).toBe(201);
    const p = (await res.json()) as Producto;
    productos.push(p.id);
    expect(p.stock?.cantidad).toBe(3);
  });

  it('rechaza un tipo incoherente con la categoría', async () => {
    const res = await enviar('POST', '/admin/productos', {
      nombre: 'RAM rara',
      marca: 'Marca de prueba',
      categoria: 'RAM',
      tipo: 'EQUIPO',
      precio: '1',
      stockInicial: 1,
      atributos: { tipoRam: 'DDR5', velocidadRam: 6000, modulos: 2 },
    });
    expect(res.status).toBe(400);
  });

  it('rechaza atributos inválidos nombrando el atributo', async () => {
    const sinSocket = await enviar('POST', '/admin/productos', {
      nombre: 'CPU sin socket',
      marca: 'Marca de prueba',
      categoria: 'PROCESADOR',
      tipo: 'COMPONENTE',
      precio: '1',
      stockInicial: 1,
      atributos: { potenciaConsumidaW: 65 },
    });
    expect(sinSocket.status).toBe(400);
    expect(((await sinSocket.json()) as { mensaje: string }).mensaje).toContain('socket');
    const tipoMalo = await enviar('POST', '/admin/productos', {
      nombre: 'Fuente rara',
      marca: 'Marca de prueba',
      categoria: 'FUENTE',
      tipo: 'COMPONENTE',
      precio: '1',
      stockInicial: 1,
      atributos: { potenciaEntregadaW: 'mucha' },
    });
    expect(tipoMalo.status).toBe(400);
    expect(((await tipoMalo.json()) as { mensaje: string }).mensaje).toContain(
      'potenciaEntregadaW',
    );
  });

  it('PATCH cambia el precio y el catálogo público lo refleja; 404 si no existe', async () => {
    const p = await crear();
    const res = await enviar('PATCH', `/admin/productos/${p.id}`, { precio: '77123.45' });
    expect(res.status).toBe(200);
    const detalle = (await (await servidor.fetch(`/productos/${p.id}`)).json()) as Producto;
    expect(detalle.precio).toBe('77123.45');
    expect(
      (await enviar('PATCH', `/admin/productos/${randomUUID()}`, { precio: '1' })).status,
    ).toBe(404);
  });

  it('PATCH valida los atributos contra la categoría del producto', async () => {
    const p = await crear();
    const res = await enviar('PATCH', `/admin/productos/${p.id}`, { atributos: { otra: 1 } });
    expect(res.status).toBe(400);
  });
});

describe('stock con bloqueo optimista', () => {
  it('con la versión vigente guarda y aumenta la versión', async () => {
    const p = await crear();
    const res = await enviar('PATCH', `/admin/stock/${p.id}`, { cantidad: 20, version: 0 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cantidad: 20, version: 1 });
  });

  it('dos administradores con la misma versión: uno gana y el otro recibe 409 con lo vigente', async () => {
    const p = await crear();
    const [a, b] = await Promise.all([
      enviar('PATCH', `/admin/stock/${p.id}`, { cantidad: 11, version: 0 }),
      enviar('PATCH', `/admin/stock/${p.id}`, { cantidad: 22, version: 0 }),
    ]);
    const estados = [a.status, b.status].sort();
    expect(estados).toEqual([200, 409]);
    const ganador = (await (a.status === 200 ? a : b).json()) as { cantidad: number };
    const perdedor = (await (a.status === 409 ? a : b).json()) as {
      codigo: string;
      detalle: { cantidad: number; version: number };
    };
    expect(perdedor.codigo).toBe('CONFLICTO');
    expect(perdedor.detalle).toEqual({ cantidad: ganador.cantidad, version: 1 });
    const { rows } = await bd.query('SELECT cantidad, version FROM stock WHERE producto_id = $1', [
      p.id,
    ]);
    expect(rows[0]).toEqual({ cantidad: ganador.cantidad, version: 1 });
  });

  it('rechaza una cantidad negativa (400) y un producto inexistente (404)', async () => {
    const p = await crear();
    expect(
      (await enviar('PATCH', `/admin/stock/${p.id}`, { cantidad: -1, version: 0 })).status,
    ).toBe(400);
    expect(
      (await enviar('PATCH', `/admin/stock/${randomUUID()}`, { cantidad: 1, version: 0 })).status,
    ).toBe(404);
  });
});

describe('catálogo público', () => {
  it('filtra por categoría y rango de precio, y la disponibilidad es el stock físico', async () => {
    const dentro = await crear({ stockInicial: 7 });
    const res = await servidor.fetch(
      `/productos?categoria=FUENTE&precioMin=${dentro.precio}&precioMax=${dentro.precio}`,
    );
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { productos: Producto[]; total: number };
    expect(cuerpo.total).toBe(1);
    expect(cuerpo.productos[0]).toMatchObject({ id: dentro.id, disponible: 7, agotado: false });
    expect(cuerpo.productos[0]).not.toHaveProperty('stock');
    expect(cuerpo.productos[0]?.atributos).toEqual({ potenciaEntregadaW: 650 });
    const otraCategoria = await servidor.fetch(
      `/productos?categoria=RAM&precioMin=${dentro.precio}&precioMax=${dentro.precio}`,
    );
    expect(((await otraCategoria.json()) as { total: number }).total).toBe(0);
  });

  it('pagina: 45 resultados, página 3 de 20 trae 5 y el total es 45', async () => {
    const base = 77_500;
    const ids: string[] = [];
    for (let i = 0; i < 45; i++) {
      const { rows } = await bd.query<{ id: string }>(
        `INSERT INTO productos (id, nombre, categoria_id, tipo, precio, atributos, actualizado_en)
         SELECT $1, $2, id, 'COMPONENTE', $3, '{"potenciaEntregadaW": 500}', now()
           FROM categorias WHERE codigo = 'FUENTE' RETURNING id`,
        [randomUUID(), `Paginada ${String(i).padStart(2, '0')}`, base + i / 100],
      );
      ids.push(rows[0]!.id);
      await bd.query('INSERT INTO stock (id, producto_id, cantidad) VALUES ($1, $2, 1)', [
        randomUUID(),
        rows[0]!.id,
      ]);
    }
    productos.push(...ids);
    const res = await servidor.fetch(
      `/productos?precioMin=${base}&precioMax=${base + 1}&pagina=3&porPagina=20`,
    );
    const cuerpo = (await res.json()) as { productos: Producto[]; total: number };
    expect(cuerpo.total).toBe(45);
    expect(cuerpo.productos).toHaveLength(5);
    const porDefecto = (await (
      await servidor.fetch(`/productos?precioMin=${base}&precioMax=${base + 1}`)
    ).json()) as {
      productos: unknown[];
    };
    expect(porDefecto.productos).toHaveLength(20);
  });

  it('responde 400 a parámetros inválidos', async () => {
    for (const q of [
      'precioMin=10&precioMax=5',
      'porPagina=101',
      'pagina=0',
      'categoria=NADA',
      'precioMin=-1',
    ]) {
      expect((await servidor.fetch(`/productos?${q}`)).status, q).toBe(400);
    }
  });

  it('un producto agotado desaparece del listado, su detalle lo marca y reaparece al reponer', async () => {
    const p = await crear({ stockInicial: 1 });
    const filtro = `/productos?precioMin=${p.precio}&precioMax=${p.precio}`;
    await enviar('PATCH', `/admin/stock/${p.id}`, { cantidad: 0, version: 0 });
    expect(((await (await servidor.fetch(filtro)).json()) as { total: number }).total).toBe(0);
    const detalle = (await (await servidor.fetch(`/productos/${p.id}`)).json()) as Producto;
    expect(detalle).toMatchObject({ disponible: 0, agotado: true });
    await enviar('PATCH', `/admin/stock/${p.id}`, { cantidad: 4, version: 1 });
    expect(((await (await servidor.fetch(filtro)).json()) as { total: number }).total).toBe(1);
  });

  it('un producto inactivo responde 404 en el detalle y no aparece en el listado', async () => {
    const p = await crear();
    await enviar('PATCH', `/admin/productos/${p.id}`, { activo: false });
    expect((await servidor.fetch(`/productos/${p.id}`)).status).toBe(404);
    const lista = await servidor.fetch(`/productos?precioMin=${p.precio}&precioMax=${p.precio}`);
    expect(((await lista.json()) as { total: number }).total).toBe(0);
    expect((await servidor.fetch('/productos/no-es-uuid')).status).toBe(404);
  });
});

describe('rutas administrativas', () => {
  const rutas: [string, string, unknown?][] = [
    ['GET', '/admin/productos'],
    ['POST', '/admin/productos', {}],
    ['PATCH', `/admin/productos/${randomUUID()}`, {}],
    ['PATCH', `/admin/stock/${randomUUID()}`, { cantidad: 1, version: 0 }],
  ];

  it.each(rutas)('%s %s: 401 sin sesión y 403 con rol CLIENTE', async (metodo, ruta, cuerpo) => {
    const sinSesion = await enviar(metodo, ruta, cuerpo, '');
    expect(sinSesion.status).toBe(401);
    const comoCliente = await enviar(metodo, ruta, cuerpo, cliente);
    expect(comoCliente.status).toBe(403);
    expect(await comoCliente.json()).toMatchObject({ codigo: 'SIN_PERMISO' });
  });

  it('un CLIENTE no crea productos', async () => {
    const antes = await bd.query('SELECT count(*) AS n FROM productos');
    await enviar(
      'POST',
      '/admin/productos',
      {
        nombre: 'x',
        categoria: 'FUENTE',
        tipo: 'COMPONENTE',
        precio: '1',
        stockInicial: 1,
        atributos: { potenciaEntregadaW: 1 },
      },
      cliente,
    );
    const despues = await bd.query('SELECT count(*) AS n FROM productos');
    expect(despues.rows[0].n).toBe(antes.rows[0].n);
  });
});

// Sprint 1.5: marca, filtros por marca, socket y texto, orden, facetas y búsqueda admin.
// Marcas y sockets únicos por ejecución para no depender del catálogo de ejemplo.
const sufijo = randomUUID().slice(0, 8);
const MARCA_A = `MarcaA-${sufijo}`;
const MARCA_B = `MarcaB-${sufijo}`;
const SOCKET = `SK-${sufijo}`;

function procesador(marca: string, extra: Record<string, unknown> = {}) {
  return crear({
    nombre: `Procesador ${marca} ${randomUUID().slice(0, 6)}`,
    marca,
    categoria: 'PROCESADOR',
    atributos: { socket: SOCKET, potenciaConsumidaW: 65 },
    ...extra,
  });
}
const lista = async (q: string) =>
  (await (await servidor.fetch(`/productos?${q}`)).json()) as {
    productos: Producto[];
    total: number;
  };

describe('marca (Sprint 1.5)', () => {
  it('el alta exige marca y la respuesta la incluye, con imagenUrl nula', async () => {
    const p = await crear({ marca: '  Corsair  ' });
    expect(p).toMatchObject({ marca: 'Corsair', imagenUrl: null });
    for (const marca of [undefined, '', '   ']) {
      const res = await enviar('POST', '/admin/productos', {
        nombre: 'Sin marca',
        categoria: 'FUENTE',
        tipo: 'COMPONENTE',
        precio: '10.00',
        stockInicial: 1,
        atributos: { potenciaEntregadaW: 500 },
        ...(marca === undefined ? {} : { marca }),
      });
      expect(res.status, String(marca)).toBe(400);
      expect(((await res.json()) as { mensaje: string }).mensaje).toMatch(/marca/i);
    }
  });

  it('PATCH cambia la marca: el detalle la refleja y el filtro anterior deja de incluirlo', async () => {
    const p = await procesador(MARCA_A);
    const res = await enviar('PATCH', `/admin/productos/${p.id}`, { marca: `Otra-${sufijo}` });
    expect(res.status).toBe(200);
    const detalle = (await (await servidor.fetch(`/productos/${p.id}`)).json()) as Producto;
    expect(detalle.marca).toBe(`Otra-${sufijo}`);
    const ids = (await lista(`marca=${MARCA_A}`)).productos.map((x) => x.id);
    expect(ids).not.toContain(p.id);
  });
});

describe('filtros, búsqueda y orden (Sprint 1.5)', () => {
  let a1: Producto, a2: Producto, b1: Producto;
  beforeAll(async () => {
    a1 = await procesador(MARCA_A);
    a2 = await procesador(MARCA_A, {
      atributos: { socket: `${SOCKET}-2`, potenciaConsumidaW: 65 },
    });
    b1 = await procesador(MARCA_B);
  });

  it('filtra por marca (sin distinguir mayúsculas) y por socket', async () => {
    const r = await lista(`categoria=PROCESADOR&marca=${MARCA_A.toLowerCase()}&socket=${SOCKET}`);
    expect(r.productos.map((x) => x.id)).toEqual([a1.id]);
  });

  it('admite varias marcas separadas por coma', async () => {
    const r = await lista(`marca=${MARCA_A},${MARCA_B}`);
    expect(r.productos.map((x) => x.id).sort()).toEqual([a1.id, a2.id, b1.id].sort());
  });

  it('busca por texto en el nombre o la marca', async () => {
    const porMarca = await lista(`q=${MARCA_B.toUpperCase()}`);
    expect(porMarca.productos.map((x) => x.id)).toEqual([b1.id]);
    const porNombre = await lista(`q=${encodeURIComponent(a1.nombre.slice(-6))}`);
    expect(porNombre.productos.map((x) => x.id)).toContain(a1.id);
  });

  it('ordena por precio sin cambiar el total, con paginación estable', async () => {
    const filtro = `marca=${MARCA_A},${MARCA_B}`;
    const asc = await lista(`${filtro}&orden=precio_asc`);
    const desc = await lista(`${filtro}&orden=precio_desc`);
    const nombre = await lista(filtro);
    const precios = (r: typeof asc) => r.productos.map((x) => Number(x.precio));
    expect(precios(asc)).toEqual([...precios(asc)].sort((x, y) => x - y));
    expect(precios(desc)).toEqual([...precios(asc)].reverse());
    expect(new Set([asc.total, desc.total, nombre.total])).toEqual(new Set([3]));
    const paginas = [1, 2, 3].map((n) =>
      lista(`${filtro}&orden=precio_asc&porPagina=1&pagina=${n}`),
    );
    const ids = (await Promise.all(paginas)).flatMap((r) => r.productos.map((x) => x.id));
    expect(ids).toEqual(asc.productos.map((x) => x.id));
  });

  it('responde 400 a filtros nuevos inválidos', async () => {
    const muchas = Array.from({ length: 11 }, (_, i) => `m${i}`).join(',');
    for (const q of ['orden=barato', 'q=a', `marca=${muchas}`, `socket=${'x'.repeat(31)}`]) {
      expect((await servidor.fetch(`/productos?${q}`)).status, q).toBe(400);
    }
  });
});

describe('facetas (Sprint 1.5)', () => {
  it('cuenta marcas y sockets con disponible, da el rango de precio y omite los agotados', async () => {
    const p1 = await procesador(`F1-${sufijo}`);
    const p2 = await procesador(`F1-${sufijo}`);
    const unico = await procesador(`F2-${sufijo}`);
    const facetas = async () =>
      (await (await servidor.fetch('/facetas?categoria=PROCESADOR')).json()) as {
        marcas: { valor: string; cantidad: number }[];
        sockets: { valor: string; cantidad: number }[];
        precio: { min: string; max: string };
      };
    let f = await facetas();
    expect(f.marcas).toContainEqual({ valor: `F1-${sufijo}`, cantidad: 2 });
    expect(f.marcas).toContainEqual({ valor: `F2-${sufijo}`, cantidad: 1 });
    expect(f.sockets.find((s) => s.valor === SOCKET)?.cantidad).toBeGreaterThanOrEqual(4);
    expect(Number(f.precio.max)).toBeGreaterThanOrEqual(Number(p2.precio));
    expect(Number(f.precio.min)).toBeLessThanOrEqual(Number(p1.precio));

    await enviar('PATCH', `/admin/stock/${unico.id}`, { cantidad: 0, version: 0 });
    f = await facetas();
    expect(f.marcas.map((m) => m.valor)).not.toContain(`F2-${sufijo}`);

    const otra = (await (await servidor.fetch('/facetas?categoria=RAM')).json()) as {
      marcas: { valor: string }[];
    };
    expect(otra.marcas.map((m) => m.valor)).not.toContain(`F1-${sufijo}`);
    expect((await servidor.fetch('/facetas?categoria=NADA')).status).toBe(400);
    expect((await servidor.fetch('/facetas')).status).toBe(200);
  });
});

describe('lista administrativa (Sprint 1.5)', () => {
  it('busca por texto y filtra por categoría, incluidos inactivos', async () => {
    const p = await procesador(`Inactiva-${sufijo}`);
    await enviar('PATCH', `/admin/productos/${p.id}`, { activo: false });
    const res = await enviar('GET', `/admin/productos?q=Inactiva-${sufijo}&categoria=PROCESADOR`);
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as {
      productos: (Producto & { activo: boolean })[];
      total: number;
    };
    expect(cuerpo.total).toBe(1);
    expect(cuerpo.productos[0]).toMatchObject({ id: p.id, activo: false });
    const otra = await enviar('GET', `/admin/productos?q=Inactiva-${sufijo}&categoria=RAM`);
    expect(((await otra.json()) as { total: number }).total).toBe(0);
    expect((await enviar('GET', '/admin/productos?q=x')).status).toBe(400);
  });
});
