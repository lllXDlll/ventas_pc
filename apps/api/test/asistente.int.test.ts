// Asistente de IA con el proveedor simulado (spec asistente; tarea 3.5 del Sprint 5) contra
// el Worker empaquetado, el Postgres local y el Durable Object local. Nunca llama a la red.
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

const TIMEOUT_IA = 1500;
const bd = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const servidor = createTestHarness({
  root: join(import.meta.dirname, '..'),
  workers: [
    {
      configPath: './wrangler.jsonc',
      vars: { COOKIE_DOMAIN: '', IA_PROVEEDOR: 'simulado', IA_TIMEOUT_MS: String(TIMEOUT_IA) },
    },
  ],
});

const usuarios: string[] = [];

async function sesion(): Promise<{ id: string; cookie: string }> {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await bd.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en) VALUES ($1, $2, 'x', now())`,
    [id, `asistente-${id}@prueba.local`],
  );
  await bd.query(
    `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en)
     VALUES ($1, $2, $3, now() + interval '1 day')`,
    [randomUUID(), createHash('sha256').update(token).digest('hex'), id],
  );
  usuarios.push(id);
  return { id, cookie: `xd_sesion=${token}` };
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

interface Recomendacion {
  configuracion: {
    id: string;
    origen: string;
    estado: string;
    agregable: boolean;
    presupuesto: string | null;
    uso: string | null;
    total: string;
    items: { producto: { id: string; categoria: { codigo: string } }; cantidad: number }[];
  };
  explicaciones: Record<string, string>;
  respaldo: boolean;
  consultas: { usadas: number; limite: number };
}

const recomendar = (
  cookie: string,
  escenario?: string,
  cuerpo: unknown = { presupuesto: 6000, uso: 'GAMING' },
) =>
  enviar(
    'POST',
    '/asistente/recomendar',
    cookie,
    cuerpo,
    escenario ? { 'x-ia-simulado': escenario } : {},
  );

/** Último registro de uso del usuario. */
async function registro(usuarioId: string) {
  const { rows } = await bd.query(
    `SELECT uso_respaldo, latencia_ms, resultado FROM uso_asistente
      WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT 1`,
    [usuarioId],
  );
  return rows[0] as {
    uso_respaldo: boolean;
    latencia_ms: number;
    resultado: { intentos: number; motivo: string | null; configuracionId: string };
  };
}

/** Filas de uso previas, dentro de la ventana de 24 h. */
async function usosPrevios(usuarioId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await bd.query(
      `INSERT INTO uso_asistente (id, usuario_id, presupuesto, uso, latencia_ms, creado_en)
       VALUES ($1, $2, 1000, 'OFICINA', 1, now() - make_interval(mins => $3))`,
      [randomUUID(), usuarioId, 60 + i],
    );
  }
}

beforeAll(async () => {
  await bd.connect();
  await servidor.listen();
  await semillaCategorias(bd);
  await semillaReglas(bd);
  await semillaCatalogo(bd);
});

afterAll(async () => {
  await bd.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuarios]);
  await servidor.close();
  await bd.end();
});

describe('recomendación (spec asistente)', () => {
  it('sin sesión: 401; datos inválidos: 400', async () => {
    expect((await recomendar('')).status).toBe(401);
    const s = await sesion();
    expect(
      (await recomendar(s.cookie, undefined, { presupuesto: 6000, uso: 'MINERIA' })).status,
    ).toBe(400);
    expect((await recomendar(s.cookie, undefined, { presupuesto: 0, uso: 'GAMING' })).status).toBe(
      400,
    );
    expect(
      (await json<{ usadas: number }>(await enviar('GET', '/asistente/limite', s.cookie))).usadas,
    ).toBe(0);
  });

  it('válida: 201, origen IA, VALIDA, agregable, completa, dentro del presupuesto y explicada', async () => {
    const s = await sesion();
    const res = await recomendar(s.cookie, 'valida');
    expect(res.status, await res.clone().text()).toBe(201);
    const r = await json<Recomendacion>(res);
    expect(r.respaldo).toBe(false);
    expect(r.configuracion).toMatchObject({
      origen: 'IA',
      estado: 'VALIDA',
      agregable: true,
      presupuesto: '6000.00',
      uso: 'GAMING',
    });
    expect(Number(r.configuracion.total)).toBeLessThanOrEqual(6000);
    const categorias = r.configuracion.items.map((i) => i.producto.categoria.codigo).sort();
    for (const c of [
      'ALMACENAMIENTO',
      'FUENTE',
      'GABINETE',
      'PLACA_MADRE',
      'PROCESADOR',
      'RAM',
      'TARJETA_GRAFICA',
    ]) {
      expect(categorias).toContain(c);
    }
    for (const i of r.configuracion.items)
      expect(r.explicaciones[i.producto.id]).toMatch(/simulada/);
    expect(r.consultas).toEqual({ usadas: 1, limite: 10 });
    const reg = await registro(s.id);
    expect(reg).toMatchObject({ uso_respaldo: false, resultado: { intentos: 1, motivo: null } });
    expect(reg.resultado.configuracionId).toBe(r.configuracion.id);
  });

  it('inválida y luego válida: 2 intentos, sin respaldo', async () => {
    const s = await sesion();
    const r = await json<Recomendacion>(await recomendar(s.cookie, 'invalida-luego-valida'));
    expect(r.respaldo).toBe(false);
    expect(r.configuracion.estado).toBe('VALIDA');
    expect((await registro(s.id)).resultado.intentos).toBe(2);
  });

  it.each(['invalida', 'json-invalido'])(
    '%s dos veces: respaldo tras exactamente 2 intentos',
    async (escenario) => {
      const s = await sesion();
      const r = await json<Recomendacion>(await recomendar(s.cookie, escenario));
      expect(r.respaldo).toBe(true);
      expect(r.configuracion).toMatchObject({ origen: 'IA', estado: 'VALIDA', agregable: true });
      const reg = await registro(s.id);
      expect(reg).toMatchObject({
        uso_respaldo: true,
        resultado: { intentos: 2, motivo: 'IA_INVALIDA' },
      });
    },
  );

  it('IA caída: respaldo válido y registrado', async () => {
    const s = await sesion();
    const r = await json<Recomendacion>(await recomendar(s.cookie, 'caida'));
    expect(r.respaldo).toBe(true);
    expect(r.configuracion.estado).toBe('VALIDA');
    expect((await registro(s.id)).resultado).toMatchObject({
      intentos: 1,
      motivo: 'IA_NO_DISPONIBLE',
    });
  });

  it('timeout: respaldo con la espera acotada al timeout más el margen', async () => {
    const s = await sesion();
    const t = Date.now();
    const r = await json<Recomendacion>(await recomendar(s.cookie, 'lenta'));
    const ms = Date.now() - t;
    expect(r.respaldo).toBe(true);
    expect(ms).toBeLessThan(TIMEOUT_IA + 2000 + 3000); // + margen del arnés local
    const reg = await registro(s.id);
    expect(reg.resultado.motivo).toBe('IA_TIMEOUT');
    expect(reg.latencia_ms).toBeGreaterThanOrEqual(TIMEOUT_IA);
  });

  it('presupuesto insuficiente: 422 con el mínimo y sin consumir cupo', async () => {
    const s = await sesion();
    const res = await recomendar(s.cookie, 'valida', { presupuesto: 300, uso: 'OFICINA' });
    expect(res.status).toBe(422);
    const e = await json<{ codigo: string; detalle: { minimo: string } }>(res);
    expect(e.codigo).toBe('PRESUPUESTO_INSUFICIENTE');
    expect(Number(e.detalle.minimo)).toBeGreaterThan(300);
    expect(
      (await json<{ usadas: number }>(await enviar('GET', '/asistente/limite', s.cookie))).usadas,
    ).toBe(0);
  });
});

describe('límite y registro (spec asistente)', () => {
  it('la undécima consulta en 24 h: 429 LIMITE_ASISTENTE con la hora de cupo', async () => {
    const s = await sesion();
    await usosPrevios(s.id, 10);
    const res = await recomendar(s.cookie, 'valida');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    const e = await json<{ codigo: string; detalle: { disponibleDesde: string; usadas: number } }>(
      res,
    );
    expect(e.codigo).toBe('LIMITE_ASISTENTE');
    expect(e.detalle.usadas).toBe(10);
    expect(new Date(e.detalle.disponibleDesde).getTime()).toBeGreaterThan(Date.now());
    const l = await json<{ usadas: number; disponibleDesde: string | null }>(
      await enviar('GET', '/asistente/limite', s.cookie),
    );
    expect(l.usadas).toBe(10);
    expect(l.disponibleDesde).not.toBeNull();
  });

  it('dos simultáneas con 9 previas: una se atiende y la otra recibe 429', async () => {
    const s = await sesion();
    await usosPrevios(s.id, 9);
    const estados = (
      await Promise.all([recomendar(s.cookie, 'valida'), recomendar(s.cookie, 'valida')])
    )
      .map((r) => r.status)
      .sort();
    expect(estados).toEqual([201, 429]);
    const { rows } = await bd.query(
      'SELECT count(*)::int AS n FROM uso_asistente WHERE usuario_id = $1',
      [s.id],
    );
    expect(rows[0].n).toBe(10);
  });

  it('GET /asistente/limite tras una consulta: 1 de 10', async () => {
    const s = await sesion();
    await recomendar(s.cookie, 'valida');
    expect(await json(await enviar('GET', '/asistente/limite', s.cookie))).toEqual({
      limite: 10,
      usadas: 1,
      disponibleDesde: null,
    });
    expect((await enviar('GET', '/asistente/limite')).status).toBe(401);
  });
});

describe('edición de la recomendación (spec configuraciones)', () => {
  it('PATCH conserva el origen IA, presupuesto y uso; un cambio incompatible da el rechazo', async () => {
    const s = await sesion();
    const r = await json<Recomendacion>(await recomendar(s.cookie, 'valida'));
    const placa = r.configuracion.items.find((i) => i.producto.categoria.codigo === 'PLACA_MADRE')!;
    const { rows } = await bd.query(
      `SELECT p.id FROM productos p JOIN categorias c ON c.id = p.categoria_id
        WHERE c.codigo = 'PLACA_MADRE' AND p.activo
          AND p.atributos->>'socket' <> (SELECT atributos->>'socket' FROM productos WHERE id = $1)
        LIMIT 1`,
      [placa.producto.id],
    );
    const items = r.configuracion.items.map((i) => ({
      productoId: i.producto.id === placa.producto.id ? rows[0].id : i.producto.id,
      cantidad: i.cantidad,
    }));
    const res = await enviar('PATCH', `/configuraciones/${r.configuracion.id}`, s.cookie, {
      items,
    });
    expect(res.status).toBe(200);
    const v = await json<{
      origen: string;
      estado: string;
      presupuesto: string;
      uso: string;
      rechazos: { codigo: string; mensaje: string }[];
    }>(res);
    expect(v).toMatchObject({
      origen: 'IA',
      estado: 'INVALIDA',
      presupuesto: '6000.00',
      uso: 'GAMING',
    });
    expect(v.rechazos.map((x) => x.codigo)).toContain('SOCKET');
    expect(v.rechazos[0]!.mensaje.length).toBeGreaterThan(0);
  });
});
