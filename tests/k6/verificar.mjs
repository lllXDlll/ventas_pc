// Verifica en Postgres el resultado de un escenario de k6 y limpia sus datos (spec
// pruebas-carga, design D7 del Sprint 6). Invariantes de todos los escenarios:
// vendido ≤ stock inicial, stock físico ≥ 0 y Σ reservas activas ≤ stock físico. Además,
// los conteos propios de cada escenario.
//
// Uso: node tests/k6/verificar.mjs [--conservar]   (DIRECT_URL igual que en preparar.mjs)
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const archivo = join(dirname(fileURLToPath(import.meta.url)), 'datos.json');
const {
  escenario = 'concurrencia',
  corrida,
  productoId,
  unidades,
} = JSON.parse(readFileSync(archivo, 'utf8'));
const cadena = process.env.DIRECT_URL || 'postgresql://xdtech:xdtech@localhost:5432/xdtech';
const bd = new pg.Client({ connectionString: cadena });
await bd.connect();

let ok = true;
const afirmar = (condicion, mensaje) => {
  console.log(`${condicion ? '✓' : '✗'} ${mensaje}`);
  ok &&= condicion;
};

try {
  const { rows: r } = await bd.query(
    `SELECT
       (SELECT cantidad FROM stock WHERE producto_id = $1) AS stock,
       (SELECT count(*)::int FROM reservas re JOIN reserva_items ri ON ri.reserva_id = re.id
         WHERE re.estado = 'ACTIVA' AND ri.producto_id = $1) AS activas,
       (SELECT count(*)::int FROM reservas re JOIN reserva_items ri ON ri.reserva_id = re.id
         WHERE re.estado = 'EXPIRADA' AND ri.producto_id = $1) AS expiradas,
       (SELECT COALESCE(SUM(ri.cantidad), 0)::int FROM reservas re JOIN reserva_items ri ON ri.reserva_id = re.id
         WHERE re.estado = 'ACTIVA' AND ri.producto_id = $1) AS reservado,
       (SELECT COALESCE(SUM(oi.cantidad), 0)::int FROM orden_items oi WHERE oi.producto_id = $1) AS vendido,
       (SELECT count(DISTINCT o.id)::int FROM ordenes o JOIN orden_items oi ON oi.orden_id = o.id
         WHERE oi.producto_id = $1) AS ordenes,
       (SELECT COALESCE(max(n), 0)::int FROM (
          SELECT count(*) AS n FROM ordenes o JOIN orden_items oi ON oi.orden_id = o.id
           WHERE oi.producto_id = $1 GROUP BY o.usuario_id) x) AS max_por_cliente`,
    [productoId],
  );
  const { stock, activas, expiradas, reservado, vendido, ordenes, max_por_cliente } = r[0];

  console.log(`escenario: ${escenario} (${corrida})`);
  afirmar(vendido <= unidades, `vendido ${vendido} ≤ stock inicial ${unidades}`);
  afirmar(stock >= 0, `stock físico ${stock} ≥ 0`);
  afirmar(reservado <= stock, `Σ reservas activas ${reservado} ≤ stock físico ${stock}`);
  if (escenario === 'concurrencia') {
    afirmar(activas === unidades, `reservas activas: ${activas} (esperadas ${unidades})`);
  } else if (escenario === 'idempotencia') {
    afirmar(ordenes === unidades, `órdenes: ${ordenes} (esperadas ${unidades}, una por cliente)`);
    afirmar(
      max_por_cliente === 1,
      `máximo de órdenes por cliente: ${max_por_cliente} (esperado 1)`,
    );
    afirmar(stock === 0, `stock físico tras vender todo: ${stock} (esperado 0)`);
  } else if (escenario === 'expiracion') {
    afirmar(
      expiradas === unidades,
      `reservas expiradas (1.ª oleada): ${expiradas} (esperadas ${unidades})`,
    );
    afirmar(
      activas === unidades,
      `reservas activas (2.ª oleada): ${activas} (esperadas ${unidades})`,
    );
  } else if (escenario === 'perdida') {
    afirmar(
      activas === unidades,
      `reservas activas (2 antes + 3 después): ${activas} (esperadas ${unidades})`,
    );
  }

  if (!process.argv.includes('--conservar')) {
    await bd.query('BEGIN');
    const usuarios = `SELECT id FROM usuarios WHERE correo LIKE $1`;
    const patron = [`${corrida}-%`];
    await bd.query(
      `DELETE FROM comprobantes WHERE orden_id IN (SELECT id FROM ordenes WHERE usuario_id IN (${usuarios}))`,
      patron,
    );
    await bd.query(`DELETE FROM ordenes WHERE usuario_id IN (${usuarios})`, patron);
    await bd.query(`DELETE FROM reservas WHERE usuario_id IN (${usuarios})`, patron);
    // Sesiones, carritos y notificaciones se borran en cascada con el usuario.
    await bd.query(`DELETE FROM usuarios WHERE correo LIKE $1`, patron);
    await bd.query('DELETE FROM productos WHERE id = $1', [productoId]);
    await bd.query('COMMIT');
    rmSync(archivo);
    console.log(`datos de la corrida ${corrida} borrados`);
  }
} finally {
  await bd.end();
}
process.exit(ok ? 0 : 1);
