// Restricciones de integridad del esquema inicial (spec esquema-datos, design.md D11).
// Se prueban directamente en Postgres: es la base la que debe rechazar los datos.
// Cada caso corre en una transacción que se revierte, así la base queda limpia.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const URL_BD = process.env.DIRECT_URL ?? 'postgresql://xdtech:xdtech@localhost:5432/xdtech';
const cliente = new pg.Client({ connectionString: URL_BD });

beforeAll(() => cliente.connect());
afterAll(() => cliente.end());
beforeEach(() => cliente.query('BEGIN'));
afterEach(() => cliente.query('ROLLBACK'));

/** Ejecuta `sql` dentro de un SAVEPOINT y devuelve el código de error de Postgres, o null. */
async function codigoError(sql: string, valores: unknown[] = []): Promise<string | null> {
  await cliente.query('SAVEPOINT intento');
  try {
    await cliente.query(sql, valores);
    await cliente.query('RELEASE SAVEPOINT intento');
    return null;
  } catch (error) {
    await cliente.query('ROLLBACK TO SAVEPOINT intento');
    return (error as { code?: string }).code ?? 'desconocido';
  }
}

const VIOLA_UNICIDAD = '23505';
const VIOLA_CHECK = '23514';
const VALOR_ENUM_INVALIDO = '22P02';

async function crearUsuario(correo = `u-${randomUUID()}@correo.com`): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en) VALUES ($1, $2, 'x', now())`,
    [id, correo],
  );
  return id;
}

async function crearProducto(): Promise<string> {
  const categoria = randomUUID();
  await cliente.query(`INSERT INTO categorias (id, codigo, nombre) VALUES ($1, $2, 'Prueba')`, [
    categoria,
    `CAT_${categoria}`,
  ]);
  const producto = randomUUID();
  await cliente.query(
    `INSERT INTO productos (id, nombre, categoria_id, tipo, precio, actualizado_en)
     VALUES ($1, 'Producto', $2, 'COMPONENTE', 100, now())`,
    [producto, categoria],
  );
  return producto;
}

describe('esquema inicial', () => {
  it('contiene todas las tablas del modelo y no contiene tokens_recuperacion', async () => {
    const { rows } = await cliente.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'`,
    );
    const tablas = rows.map((r) => r.table_name).sort();
    expect(tablas).toEqual(
      [
        'usuarios',
        'sesiones',
        'categorias',
        'productos',
        'stock',
        'reglas_compatibilidad',
        'configuraciones',
        'configuracion_items',
        'carritos',
        'carrito_items',
        'reservas',
        'reserva_items',
        'ordenes',
        'orden_items',
        'comprobantes',
        'notificaciones',
        'uso_asistente',
      ].sort(),
    );
    expect(tablas).not.toContain('tokens_recuperacion');
  });
});

describe('usuarios', () => {
  it('rechaza un correo duplicado aunque cambien las mayúsculas', async () => {
    await crearUsuario('Ana@Correo.com');
    expect(
      await codigoError(
        `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en) VALUES ($1, 'ana@correo.com', 'x', now())`,
        [randomUUID()],
      ),
    ).toBe(VIOLA_UNICIDAD);
  });

  it('rechaza un rol fuera de CLIENTE y ADMIN', async () => {
    expect(
      await codigoError(
        `INSERT INTO usuarios (id, correo, hash_contrasena, rol, actualizado_en) VALUES ($1, 'x@y.com', 'x', 'SUPERADMIN', now())`,
        [randomUUID()],
      ),
    ).toBe(VALOR_ENUM_INVALIDO);
  });
});

describe('sesiones', () => {
  it('guarda solo el hash del token y lo exige único', async () => {
    const { rows } = await cliente.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'sesiones'`,
    );
    const columnas = rows.map((r) => r.column_name);
    expect(columnas).toContain('token_hash');
    expect(columnas.filter((c) => c === 'token' || c === 'token_claro')).toEqual([]);

    const usuario = await crearUsuario();
    const insertar = `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en) VALUES ($1, 'h1', $2, now())`;
    expect(await codigoError(insertar, [randomUUID(), usuario])).toBeNull();
    expect(await codigoError(insertar, [randomUUID(), usuario])).toBe(VIOLA_UNICIDAD);
  });

  it('guarda la fecha de revocación, vacía mientras la sesión no esté revocada', async () => {
    const { rows } = await cliente.query<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_name = 'sesiones' AND column_name = 'revocada_en'`,
    );
    expect(rows).toEqual([{ data_type: 'timestamp with time zone', is_nullable: 'YES' }]);

    const usuario = await crearUsuario();
    const id = randomUUID();
    await cliente.query(
      `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en) VALUES ($1, 'h-revocada', $2, now())`,
      [id, usuario],
    );
    const nueva = await cliente.query(`SELECT revocada_en FROM sesiones WHERE id = $1`, [id]);
    expect(nueva.rows[0].revocada_en).toBeNull();
  });
});

describe('stock', () => {
  it('rechaza una cantidad negativa', async () => {
    const producto = await crearProducto();
    expect(
      await codigoError(`INSERT INTO stock (id, producto_id, cantidad) VALUES ($1, $2, -1)`, [
        randomUUID(),
        producto,
      ]),
    ).toBe(VIOLA_CHECK);
  });

  it('admite un solo registro de stock por producto', async () => {
    const producto = await crearProducto();
    const insertar = `INSERT INTO stock (id, producto_id, cantidad) VALUES ($1, $2, 5)`;
    expect(await codigoError(insertar, [randomUUID(), producto])).toBeNull();
    expect(await codigoError(insertar, [randomUUID(), producto])).toBe(VIOLA_UNICIDAD);
  });

  it('empieza con versión 0 para el bloqueo optimista', async () => {
    const producto = await crearProducto();
    const { rows } = await cliente.query<{ version: number }>(
      `INSERT INTO stock (id, producto_id, cantidad) VALUES ($1, $2, 5) RETURNING version`,
      [randomUUID(), producto],
    );
    expect(rows[0]?.version).toBe(0);
  });
});

describe('reservas y órdenes', () => {
  it('rechaza un estado de reserva fuera de ACTIVA, CONFIRMADA y EXPIRADA', async () => {
    const usuario = await crearUsuario();
    expect(
      await codigoError(
        `INSERT INTO reservas (id, usuario_id, estado, vence_en) VALUES ($1, $2, 'PENDIENTE', now())`,
        [randomUUID(), usuario],
      ),
    ).toBe(VALOR_ENUM_INVALIDO);
  });

  it('rechaza una segunda orden con la misma clave de idempotencia', async () => {
    const usuario = await crearUsuario();
    const crearReserva = async () => {
      const id = randomUUID();
      await cliente.query(
        `INSERT INTO reservas (id, usuario_id, vence_en) VALUES ($1, $2, now() + interval '10 minutes')`,
        [id, usuario],
      );
      return id;
    };
    const insertar = `INSERT INTO ordenes (id, usuario_id, reserva_id, clave_idempotencia, total) VALUES ($1, $2, $3, 'clave-1', 100)`;
    expect(await codigoError(insertar, [randomUUID(), usuario, await crearReserva()])).toBeNull();
    expect(await codigoError(insertar, [randomUUID(), usuario, await crearReserva()])).toBe(
      VIOLA_UNICIDAD,
    );
  });
});

describe('carrito_items', () => {
  async function preparar() {
    const usuario = await crearUsuario();
    const carrito = randomUUID();
    await cliente.query(
      `INSERT INTO carritos (id, usuario_id, actualizado_en) VALUES ($1, $2, now())`,
      [carrito, usuario],
    );
    const configuracion = randomUUID();
    await cliente.query(
      `INSERT INTO configuraciones (id, usuario_id, origen) VALUES ($1, $2, 'MANUAL')`,
      [configuracion, usuario],
    );
    return { carrito, configuracion, producto: await crearProducto() };
  }
  const insertar = `INSERT INTO carrito_items (id, carrito_id, producto_id, configuracion_id) VALUES ($1, $2, $3, $4)`;

  it('acepta un ítem con solo producto o solo configuración', async () => {
    const { carrito, configuracion, producto } = await preparar();
    expect(await codigoError(insertar, [randomUUID(), carrito, producto, null])).toBeNull();
    expect(await codigoError(insertar, [randomUUID(), carrito, null, configuracion])).toBeNull();
  });

  it('rechaza un ítem sin destino o con ambos destinos', async () => {
    const { carrito, configuracion, producto } = await preparar();
    expect(await codigoError(insertar, [randomUUID(), carrito, null, null])).toBe(VIOLA_CHECK);
    expect(await codigoError(insertar, [randomUUID(), carrito, producto, configuracion])).toBe(
      VIOLA_CHECK,
    );
  });

  it('rechaza una cantidad cero', async () => {
    const { carrito, producto } = await preparar();
    expect(
      await codigoError(
        `INSERT INTO carrito_items (id, carrito_id, producto_id, cantidad) VALUES ($1, $2, $3, 0)`,
        [randomUUID(), carrito, producto],
      ),
    ).toBe(VIOLA_CHECK);
  });
});
