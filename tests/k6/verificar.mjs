// Verifica en Postgres el resultado de la corrida de k6 (HU-37a) y limpia sus datos:
// exactamente `unidades` reservas activas, Σ reservado ≤ stock, stock físico ≥ 0 y ninguna
// orden por encima del stock.
//
// Uso: node tests/k6/verificar.mjs [--conservar]   (DIRECT_URL igual que en preparar.mjs)
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const archivo = join(dirname(fileURLToPath(import.meta.url)), 'datos.json');
const { corrida, productoId, unidades } = JSON.parse(readFileSync(archivo, 'utf8'));
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
       (SELECT COALESCE(SUM(ri.cantidad), 0)::int FROM reservas re JOIN reserva_items ri ON ri.reserva_id = re.id
         WHERE re.estado = 'ACTIVA' AND ri.producto_id = $1) AS reservado,
       (SELECT COALESCE(SUM(oi.cantidad), 0)::int FROM orden_items oi WHERE oi.producto_id = $1) AS vendido`,
    [productoId],
  );
  const { stock, activas, reservado, vendido } = r[0];
  afirmar(activas === unidades, `reservas activas: ${activas} (esperadas ${unidades})`);
  afirmar(reservado <= unidades, `reservado ${reservado} ≤ unidades ${unidades}`);
  afirmar(stock >= 0, `stock físico ${stock} ≥ 0`);
  afirmar(
    vendido <= unidades,
    `vendido ${vendido} ≤ unidades ${unidades} (ninguna orden por encima del stock)`,
  );

  if (!process.argv.includes('--conservar')) {
    await bd.query('BEGIN');
    const usuarios = `SELECT id FROM usuarios WHERE correo LIKE $1`;
    await bd.query(`DELETE FROM reservas WHERE usuario_id IN (${usuarios})`, [`${corrida}-%`]);
    await bd.query(`DELETE FROM usuarios WHERE correo LIKE $1`, [`${corrida}-%`]);
    await bd.query('DELETE FROM productos WHERE id = $1', [productoId]);
    await bd.query('COMMIT');
    rmSync(archivo);
    console.log(`datos de la corrida ${corrida} borrados`);
  }
} finally {
  await bd.end();
}
process.exit(ok ? 0 : 1);
