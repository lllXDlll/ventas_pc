// Prepara un escenario de k6 (HU-37a y HU-37b; design D11 del Sprint 3 y D7 del Sprint 6):
// un producto con 5 unidades y clientes con sesión y 1 unidad en el carrito. Las sesiones se
// insertan directamente en la base para no chocar con el límite de registro por IP.
//
// Uso: node tests/k6/preparar.mjs [api] [--escenario concurrencia|idempotencia|expiracion|perdida]
//      (DIRECT_URL: Postgres local si no está definida)
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const args = process.argv.slice(2);
const pos = args.indexOf('--escenario');
const ESCENARIO = pos >= 0 ? args[pos + 1] : 'concurrencia';
const API =
  args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--escenario') ??
  'http://localhost:8787';

/** Clientes por escenario: la expiración usa 5 + 50 y la pérdida 2 + 50 (dos oleadas). */
const CLIENTES_POR_ESCENARIO = { concurrencia: 300, idempotencia: 5, expiracion: 55, perdida: 52 };
if (!(ESCENARIO in CLIENTES_POR_ESCENARIO)) {
  console.error(`escenario desconocido: ${ESCENARIO}`);
  process.exit(2);
}
const CLIENTES = Number(process.env.K6_CLIENTES ?? CLIENTES_POR_ESCENARIO[ESCENARIO]);
const UNIDADES = Number(process.env.K6_UNIDADES ?? 5);
const cadena = process.env.DIRECT_URL || 'postgresql://xdtech:xdtech@localhost:5432/xdtech';
const corrida = `k6-${ESCENARIO}-${Date.now()}`;

const bd = new pg.Client({ connectionString: cadena });
await bd.connect();

async function sesion(i, rol = 'CLIENTE') {
  const usuario = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await bd.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, rol, actualizado_en)
     VALUES ($1, $2, 'x', $3, now())`,
    [usuario, `${corrida}-${i}@xdtech.test`, rol],
  );
  await bd.query(
    `INSERT INTO sesiones (id, token_hash, usuario_id, vence_en)
     VALUES ($1, $2, $3, now() + interval '1 day')`,
    [randomUUID(), createHash('sha256').update(token).digest('hex'), usuario],
  );
  return { usuario, cookie: `xd_sesion=${token}` };
}

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
    const { usuario, cookie } = await sesion(i);
    const carrito = randomUUID();
    await bd.query(`INSERT INTO carritos (id, usuario_id, actualizado_en) VALUES ($1, $2, now())`, [
      carrito,
      usuario,
    ]);
    await bd.query(
      `INSERT INTO carrito_items (id, carrito_id, producto_id, cantidad) VALUES ($1, $2, $3, 1)`,
      [randomUUID(), carrito, productoId],
    );
    cookies.push(cookie);
  }
  // La pérdida del almacén necesita un ADMIN para POST /pruebas/inventario/vaciar.
  const admin = ESCENARIO === 'perdida' ? (await sesion('admin', 'ADMIN')).cookie : undefined;
  await bd.query('COMMIT');
  const destino = join(dirname(fileURLToPath(import.meta.url)), 'datos.json');
  writeFileSync(
    destino,
    JSON.stringify({
      api: API,
      escenario: ESCENARIO,
      corrida,
      productoId,
      unidades: UNIDADES,
      cookies,
      admin,
    }),
  );
  console.log(
    `listo (${ESCENARIO}): ${CLIENTES} clientes, producto ${productoId} con ${UNIDADES} unidades → ${destino}`,
  );
} catch (error) {
  await bd.query('ROLLBACK');
  throw error;
} finally {
  await bd.end();
}
