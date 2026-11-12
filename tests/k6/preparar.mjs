// Prepara el escenario de k6 (HU-37a, design D11 del Sprint 3): un producto con 5 unidades
// y 300 clientes con sesión y 1 unidad en el carrito. Las sesiones se insertan directamente
// en la base para no chocar con el límite de registro por IP (5 por hora).
//
// Uso: node tests/k6/preparar.mjs [api]   (DIRECT_URL: Postgres local si no está definida)
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const API = process.argv[2] ?? 'http://localhost:8787';
const CLIENTES = Number(process.env.K6_CLIENTES ?? 300);
const UNIDADES = Number(process.env.K6_UNIDADES ?? 5);
const cadena = process.env.DIRECT_URL || 'postgresql://xdtech:xdtech@localhost:5432/xdtech';
const corrida = `k6-${Date.now()}`;

const bd = new pg.Client({ connectionString: cadena });
await bd.connect();
try {
  await bd.query('BEGIN');
  const productoId = randomUUID();
  await bd.query(
    `INSERT INTO productos (id, nombre, marca, categoria_id, tipo, precio, atributos, actualizado_en)
     SELECT $1, $2, 'k6', id, 'COMPONENTE', 199.00, '{"potenciaEntregadaW": 500}', now()
       FROM categorias WHERE codigo = 'FUENTE'`,
    [productoId, `Fuente limitada ${corrida}`],
  );
  await bd.query('INSERT INTO stock (id, producto_id, cantidad) VALUES ($1, $2, $3)', [
    randomUUID(),
    productoId,
    UNIDADES,
  ]);
  const cookies = [];
  for (let i = 0; i < CLIENTES; i++) {
    const usuario = randomUUID();
    const token = randomBytes(32).toString('base64url');
    await bd.query(
      `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en)
       VALUES ($1, $2, 'x', now())`,
      [usuario, `${corrida}-${i}@xdtech.test`],
    );
    await bd.query(
      `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en)
       VALUES ($1, $2, $3, now() + interval '1 day')`,
      [randomUUID(), createHash('sha256').update(token).digest('hex'), usuario],
    );
    const carrito = randomUUID();
    await bd.query(`INSERT INTO carritos (id, usuario_id, actualizado_en) VALUES ($1, $2, now())`, [
      carrito,
      usuario,
    ]);
    await bd.query(
      `INSERT INTO carrito_items (id, carrito_id, producto_id, cantidad) VALUES ($1, $2, $3, 1)`,
      [randomUUID(), carrito, productoId],
    );
    cookies.push(`xd_sesion=${token}`);
  }
  await bd.query('COMMIT');
  const destino = join(dirname(fileURLToPath(import.meta.url)), 'datos.json');
  writeFileSync(
    destino,
    JSON.stringify({ api: API, corrida, productoId, unidades: UNIDADES, cookies }),
  );
  console.log(
    `listo: ${CLIENTES} clientes, producto ${productoId} con ${UNIDADES} unidades → ${destino}`,
  );
} catch (error) {
  await bd.query('ROLLBACK');
  throw error;
} finally {
  await bd.end();
}
