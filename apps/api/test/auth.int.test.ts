// Autenticación, sesiones, límites y roles (specs autenticacion, limite-peticiones y
// autorizacion-roles) contra el Worker empaquetado y el Postgres local.
// Cada prueba usa correos e IPs aleatorios: los contadores de Limites persisten entre corridas.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';
import { semillaAdmin, URL_LOCAL } from '../scripts/semillas.ts';

const bd = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const servidor = createTestHarness({
  root: join(import.meta.dirname, '..'),
  workers: [
    {
      configPath: './wrangler.jsonc',
      vars: { FRONTEND_ORIGIN: 'http://localhost:3000', COOKIE_DOMAIN: '' },
    },
  ],
});

const creados: string[] = [];
beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
});
afterAll(async () => {
  if (creados.length) await bd.query('DELETE FROM usuarios WHERE correo = ANY($1)', [creados]);
  await servidor.close();
  await bd.end();
});

const correoNuevo = () => {
  const correo = `u-${randomUUID()}@prueba.local`;
  creados.push(correo);
  return correo;
};
const ipNueva = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

function post(ruta: string, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
  return servidor.fetch(ruta, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });
}
const registrar = (correo: string, contrasena = 'clave-segura-1', ip = ipNueva()) =>
  post('/auth/registro', { correo, contrasena }, { 'cf-connecting-ip': ip });
const login = (correo: string, contrasena = 'clave-segura-1', ip = ipNueva()) =>
  post('/auth/login', { correo, contrasena }, { 'cf-connecting-ip': ip });

/** "xd_sesion=<token>" a partir de Set-Cookie. */
function cookieDe(res: { headers: { get(nombre: string): string | null } }): string {
  const valor = res.headers.get('set-cookie') ?? '';
  const par = valor.split(';')[0] ?? '';
  expect(par.startsWith('xd_sesion=')).toBe(true);
  return par;
}
const me = (cookie?: string) =>
  servidor.fetch('/auth/me', cookie ? { headers: { cookie } } : undefined);

async function cuentaConSesion(): Promise<{ correo: string; cookie: string }> {
  const correo = correoNuevo();
  expect((await registrar(correo)).status).toBe(201);
  const res = await login(correo);
  expect(res.status).toBe(200);
  return { correo, cookie: cookieDe(res) };
}

describe('registro', () => {
  it('crea la cuenta CLIENTE y no devuelve la contraseña ni su hash', async () => {
    const correo = correoNuevo();
    const res = await registrar(correo);
    expect(res.status).toBe(201);
    const cuerpo = (await res.json()) as Record<string, unknown>;
    expect(cuerpo).toMatchObject({ correo, rol: 'CLIENTE' });
    expect(typeof cuerpo.id).toBe('string');
    expect(JSON.stringify(cuerpo)).not.toMatch(/contrasena|hash|clave-segura/);
    const { rows } = await bd.query(
      'SELECT hash_contrasena, estado FROM usuarios WHERE correo = $1',
      [correo],
    );
    expect(rows[0].hash_contrasena).toMatch(/^pbkdf2\$50000\$/);
    expect(rows[0].estado).toBe('ACTIVO');
  });

  it('responde 409 si el correo ya existe, aunque cambien las mayúsculas', async () => {
    const correo = correoNuevo();
    await registrar(correo);
    const res = await registrar(correo.toUpperCase());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ codigo: 'CORREO_REGISTRADO' });
  });

  it('responde 400 con un correo inválido o una contraseña corta, sin crear la cuenta', async () => {
    const r1 = await registrar('no-es-correo');
    expect(r1.status).toBe(400);
    expect(((await r1.json()) as { mensaje: string }).mensaje).toMatch(/correo/i);
    const correo = correoNuevo();
    const r2 = await registrar(correo, 'corta');
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as { mensaje: string }).mensaje).toMatch(/8 caracteres/);
    const { rows } = await bd.query('SELECT 1 FROM usuarios WHERE correo = $1', [correo]);
    expect(rows).toHaveLength(0);
  });
});

describe('límite de registro por IP', () => {
  it('el sexto registro de la misma IP en la hora recibe 429 con Retry-After', async () => {
    const ip = ipNueva();
    for (let i = 0; i < 5; i++)
      expect((await registrar(correoNuevo(), 'clave-segura-1', ip)).status).toBe(201);
    const correo = correoNuevo();
    const res = await registrar(correo, 'clave-segura-1', ip);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ codigo: 'DEMASIADAS_PETICIONES' });
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    const { rows } = await bd.query('SELECT 1 FROM usuarios WHERE correo = $1', [correo]);
    expect(rows).toHaveLength(0);
  });

  it('10 registros simultáneos desde una IP: exactamente 5 pasan', async () => {
    const ip = ipNueva();
    const estados = await Promise.all(
      Array.from(
        { length: 10 },
        async () => (await registrar(correoNuevo(), 'clave-segura-1', ip)).status,
      ),
    );
    expect(estados.filter((e) => e === 201)).toHaveLength(5);
    expect(estados.filter((e) => e === 429)).toHaveLength(5);
  });

  it('cuenta las IPv6 de una misma red /64 juntas', async () => {
    const red = `2800:200:${Math.floor(Math.random() * 0xffff).toString(16)}:240`;
    for (let i = 0; i < 5; i++)
      await registrar(correoNuevo(), 'clave-segura-1', `${red}::${i + 1}`);
    expect((await registrar(correoNuevo(), 'clave-segura-1', `${red}:f4c0::28ff`)).status).toBe(
      429,
    );
  });
});

describe('inicio de sesión', () => {
  it('con credenciales correctas responde 200 y una cookie HttpOnly SameSite=Lax (local: sin Domain ni Secure)', async () => {
    const correo = correoNuevo();
    await registrar(correo);
    const res = await login(correo.toUpperCase());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ correo, rol: 'CLIENTE' });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^xd_sesion=[A-Za-z0-9_-]{43};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=604800/);
    expect(cookie).not.toMatch(/Domain=|Secure/i);
  });

  it('guarda solo el hash del token', async () => {
    const { correo, cookie } = await cuentaConSesion();
    const token = cookie.split('=')[1] ?? '';
    const { rows } = await bd.query(
      'SELECT s.token_hash FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE u.correo = $1',
      [correo],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].token_hash).not.toBe(token);
  });

  it('responde el mismo 401 genérico para un correo inexistente, una contraseña incorrecta o una cuenta bloqueada', async () => {
    const correo = correoNuevo();
    await registrar(correo);
    const inexistente = await login(`nadie-${randomUUID()}@prueba.local`);
    const incorrecta = await login(correo, 'otra-clave-1');
    await bd.query(`UPDATE usuarios SET estado = 'BLOQUEADO' WHERE correo = $1`, [correo]);
    const bloqueada = await login(correo);
    const cuerpos = await Promise.all([inexistente, incorrecta, bloqueada].map((r) => r.json()));
    expect([inexistente.status, incorrecta.status, bloqueada.status]).toEqual([401, 401, 401]);
    expect(cuerpos[1]).toEqual(cuerpos[0]);
    expect(cuerpos[2]).toEqual(cuerpos[0]);
    expect(cuerpos[0]).toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    expect(bloqueada.headers.get('set-cookie')).toBeNull();
  });

  it('borra las sesiones vencidas o revocadas del usuario y conserva las válidas', async () => {
    const correo = correoNuevo();
    await registrar(correo);
    await login(correo);
    await login(correo);
    await bd.query(
      `UPDATE sesiones SET vence_en = now() - interval '1 hour'
        WHERE id = (SELECT s.id FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
                     WHERE u.correo = $1 ORDER BY s.creada_en LIMIT 1)`,
      [correo],
    );
    await login(correo);
    const { rows } = await bd.query(
      `SELECT count(*) FILTER (WHERE vence_en <= now()) AS vencidas, count(*) AS total
         FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE u.correo = $1`,
      [correo],
    );
    expect(Number(rows[0].vencidas)).toBe(0);
    expect(Number(rows[0].total)).toBe(2);
  });

  it('abre una sola conexión a Postgres aunque haga varias consultas (design D1)', async () => {
    const correo = correoNuevo();
    await registrar(correo);
    // pg_stat_database.sessions se publica con retraso y cada medición suma una sesión fija:
    // se comparan lotes iguales en vez de un valor absoluto.
    const lote = async (peticion: () => Promise<unknown>) => {
      await new Promise((r) => setTimeout(r, 2000));
      const leer = async () =>
        Number(
          (
            await bd.query<{ s: string }>(
              'SELECT sessions AS s FROM pg_stat_database WHERE datname = current_database()',
            )
          ).rows[0]?.s,
        );
      const antes = await leer();
      for (let i = 0; i < 6; i++) await peticion();
      await new Promise((r) => setTimeout(r, 3000));
      return (await leer()) - antes;
    };
    const unaConsulta = await lote(() => servidor.fetch('/health/ready'));
    const tresConsultas = await lote(() => login(correo)); // usuario, limpieza y alta
    // Con conexiones separadas la diferencia es de ~6 sesiones; se tolera el ruido de ±1-2.
    expect(tresConsultas).toBeLessThanOrEqual(unaConsulta + 2);
  }, 30_000);
});

describe('límites de inicio de sesión', () => {
  it('tras 5 fallos de un correo, el sexto intento recibe 429 aunque la contraseña sea correcta', async () => {
    const correo = correoNuevo();
    await registrar(correo);
    for (let i = 0; i < 5; i++) expect((await login(correo, 'mala-clave-1')).status).toBe(401);
    const res = await login(correo);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).not.toBeNull();
  });

  it('un acierto reinicia el contador del correo', async () => {
    const correo = correoNuevo();
    await registrar(correo);
    for (let i = 0; i < 3; i++) await login(correo, 'mala-clave-1');
    expect((await login(correo)).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await login(correo, 'mala-clave-1')).status).toBe(401);
    expect((await login(correo, 'mala-clave-1')).status).toBe(429);
  });

  it('una IP con 51 intentos en 15 minutos recibe 429 en el último', async () => {
    const ip = ipNueva();
    const estados: number[] = [];
    for (let i = 0; i < 51; i++) {
      estados.push(
        (await login(`otro-${i}-${randomUUID()}@prueba.local`, 'x-clave-123', ip)).status,
      );
    }
    expect(estados.slice(0, 50).every((e) => e === 401)).toBe(true);
    expect(estados[50]).toBe(429);
  }, 60_000);
});

describe('sesión, me y cierre', () => {
  it('GET /auth/me devuelve el usuario de la sesión', async () => {
    const { correo, cookie } = await cuentaConSesion();
    const res = await me(cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ correo, rol: 'CLIENTE' });
  });

  it('GET /auth/me responde 401 sin cookie o con un token desconocido', async () => {
    expect((await me()).status).toBe(401);
    const res = await me('xd_sesion=token-que-no-existe');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
  });

  it('el cierre revoca la sesión, vence la cookie y el token deja de servir', async () => {
    const { correo, cookie } = await cuentaConSesion();
    const res = await servidor.fetch('/auth/logout', { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toMatch(/xd_sesion=;.*Expires=Thu, 01 Jan 1970/);
    expect((await me(cookie)).status).toBe(401);
    const { rows } = await bd.query(
      'SELECT s.revocada, s.revocada_en FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE u.correo = $1',
      [correo],
    );
    expect(rows[0].revocada).toBe(true);
    expect(rows[0].revocada_en).toBeInstanceOf(Date);
  });

  it('una sesión vencida que sigue en la tabla recibe 401', async () => {
    const { correo, cookie } = await cuentaConSesion();
    await bd.query(
      `UPDATE sesiones SET vence_en = now() - interval '1 second'
        WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = $1)`,
      [correo],
    );
    expect((await me(cookie)).status).toBe(401);
  });

  it('una cuenta bloqueada con sesión abierta recibe 401 en su siguiente petición', async () => {
    const { correo, cookie } = await cuentaConSesion();
    await bd.query(`UPDATE usuarios SET estado = 'BLOQUEADO' WHERE correo = $1`, [correo]);
    expect((await me(cookie)).status).toBe(401);
  });

  it('el administrador de la semilla inicia sesión con el hash generado en Node', async () => {
    const correo = correoNuevo();
    await semillaAdmin(bd, correo, 'clave-admin-segura-1');
    const res = await login(correo, 'clave-admin-segura-1');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rol: 'ADMIN' });
  });
});

describe('CORS en autenticación', () => {
  it('solo el origen del frontend recibe Access-Control-Allow-Origin con credenciales', async () => {
    const propio = await servidor.fetch('/auth/login', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' },
    });
    expect(propio.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(propio.headers.get('access-control-allow-credentials')).toBe('true');
    const ajeno = await servidor.fetch('/auth/login', {
      method: 'OPTIONS',
      headers: { origin: 'https://otro.example', 'access-control-request-method': 'POST' },
    });
    expect(ajeno.headers.get('access-control-allow-origin')).toBeNull();
  });
});
