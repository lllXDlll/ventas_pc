// Imágenes de producto en R2 (spec imagenes-producto, design D9 del Sprint 1.5) contra el
// Worker empaquetado, el Postgres local y R2 simulado por Wrangler.
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
let r2: R2Bucket;

const ip = () => `10.78.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
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
  r2 = (await servidor.getWorker<{ IMAGENES: R2Bucket }>().getEnv()).IMAGENES;
  await semillaCategorias(bd);
  const correoAdmin = `admin-img-${randomUUID()}@prueba.local`;
  const correoCliente = `cliente-img-${randomUUID()}@prueba.local`;
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

interface Producto {
  id: string;
  imagenUrl: string | null;
  stock: { cantidad: number; version: number };
}

async function crear(): Promise<Producto> {
  const res = await servidor.fetch('/admin/productos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin },
    body: JSON.stringify({
      nombre: `Fuente con imagen ${randomUUID()}`,
      marca: 'Marca de prueba',
      categoria: 'FUENTE',
      tipo: 'COMPONENTE',
      precio: '78000.00',
      stockInicial: 5,
      atributos: { potenciaEntregadaW: 650 },
    }),
  });
  expect(res.status).toBe(201);
  const p = (await res.json()) as Producto;
  productos.push(p.id);
  return p;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function png(bytes: number): Uint8Array {
  const b = new Uint8Array(bytes);
  b.set(PNG);
  return b;
}

function subir(id: string, cuerpo: Uint8Array, tipo = 'image/png', cookie = admin) {
  return servidor.fetch(`/admin/productos/${id}/imagen`, {
    method: 'PUT',
    headers: { 'content-type': tipo, ...(cookie ? { cookie } : {}) },
    body: cuerpo,
  });
}

const claveEnBd = async (id: string) =>
  (
    await bd.query<{ imagen_clave: string | null }>(
      'SELECT imagen_clave FROM productos WHERE id = $1',
      [id],
    )
  ).rows[0]?.imagen_clave ?? null;

describe('subida de imagen', () => {
  it('sube un PNG de 300 KB: 200 con la URL y el detalle la incluye', async () => {
    const p = await crear();
    const res = await subir(p.id, png(300 * 1024));
    expect(res.status, await res.clone().text()).toBe(200);
    const { imagenUrl } = (await res.json()) as { imagenUrl: string };
    expect(imagenUrl).toMatch(new RegExp(`^/productos/${p.id}/imagen/[0-9a-f-]{36}\\.png$`));
    const detalle = (await (await servidor.fetch(`/productos/${p.id}`)).json()) as Producto;
    expect(detalle.imagenUrl).toBe(imagenUrl);
    const clave = await claveEnBd(p.id);
    expect(await r2.head(clave ?? '')).not.toBeNull();
  });

  it('reemplazar apunta a la nueva y borra la anterior del almacenamiento', async () => {
    const p = await crear();
    await subir(p.id, png(1000));
    const primera = await claveEnBd(p.id);
    const res = await subir(p.id, png(2000));
    expect(res.status).toBe(200);
    const segunda = await claveEnBd(p.id);
    expect(segunda).not.toBe(primera);
    expect(await r2.head(primera ?? '')).toBeNull();
    expect(await r2.head(segunda ?? '')).not.toBeNull();
  });

  it('3 MB: 413 y conserva la imagen anterior', async () => {
    const p = await crear();
    await subir(p.id, png(1000));
    const antes = await claveEnBd(p.id);
    const res = await subir(p.id, png(3 * 1024 * 1024));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { codigo: string }).codigo).toBe('IMAGEN_DEMASIADO_GRANDE');
    expect(await claveEnBd(p.id)).toBe(antes);
  });

  it('un archivo que no es imagen, aunque diga image/png: 415 y no guarda nada', async () => {
    const p = await crear();
    const res = await subir(p.id, new TextEncoder().encode('no soy una imagen, solo texto'));
    expect(res.status).toBe(415);
    expect(((await res.json()) as { codigo: string }).codigo).toBe('TIPO_NO_ADMITIDO');
    expect(await claveEnBd(p.id)).toBeNull();
    const listado = await r2.list({ prefix: `productos/${p.id}/` });
    expect(listado.objects).toHaveLength(0);
  });

  it('sin sesión 401, como CLIENTE 403, y un producto inexistente 404', async () => {
    const p = await crear();
    expect((await subir(p.id, png(100), 'image/png', '')).status).toBe(401);
    expect((await subir(p.id, png(100), 'image/png', cliente)).status).toBe(403);
    expect(await claveEnBd(p.id)).toBeNull();
    expect((await subir(randomUUID(), png(100))).status).toBe(404);
  });

  it('no cambia el stock ni su versión', async () => {
    const p = await crear();
    await servidor.fetch(`/admin/stock/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: admin },
      body: JSON.stringify({ cantidad: 5, version: 0 }),
    });
    await servidor.fetch(`/admin/stock/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: admin },
      body: JSON.stringify({ cantidad: 5, version: 1 }),
    });
    await subir(p.id, png(500));
    const { rows } = await bd.query('SELECT cantidad, version FROM stock WHERE producto_id = $1', [
      p.id,
    ]);
    expect(rows[0]).toEqual({ cantidad: 5, version: 2 });
  });
});

describe('borrado y entrega', () => {
  it('sirve la imagen sin sesión con tipo, ETag y caché inmutable', async () => {
    const p = await crear();
    const { imagenUrl } = (await (await subir(p.id, png(4096))).json()) as { imagenUrl: string };
    const res = await servidor.fetch(imagenUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('etag')).toBeTruthy();
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await res.arrayBuffer()).byteLength).toBe(4096);
  });

  it('DELETE: 204, el detalle queda sin imagen y el objeto se borra', async () => {
    const p = await crear();
    const { imagenUrl } = (await (await subir(p.id, png(100))).json()) as { imagenUrl: string };
    const clave = await claveEnBd(p.id);
    const res = await servidor.fetch(`/admin/productos/${p.id}/imagen`, {
      method: 'DELETE',
      headers: { cookie: admin },
    });
    expect(res.status).toBe(204);
    const detalle = (await (await servidor.fetch(`/productos/${p.id}`)).json()) as Producto;
    expect(detalle.imagenUrl).toBeNull();
    expect(await r2.head(clave ?? '')).toBeNull();
    expect((await servidor.fetch(imagenUrl)).status).toBe(404);
  });

  it('404 para un archivo que no coincide o un producto inactivo', async () => {
    const p = await crear();
    const { imagenUrl } = (await (await subir(p.id, png(100))).json()) as { imagenUrl: string };
    expect((await servidor.fetch(`/productos/${p.id}/imagen/${randomUUID()}.png`)).status).toBe(
      404,
    );
    await servidor.fetch(`/admin/productos/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: admin },
      body: JSON.stringify({ activo: false }),
    });
    expect((await servidor.fetch(imagenUrl)).status).toBe(404);
  });
});
