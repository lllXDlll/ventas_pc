// Consultas a Postgres para reconstruir el disponible (design D2 del Sprint 3).
import { conPrisma } from '../datos/prisma';
import type { FuenteFisica } from './disponible.service';

/**
 * Reservas ACTIVA vigentes por producto en Postgres (para reconstruir un disponible que
 * falta): disponible = stock físico − esto.
 */
export async function reservadoActivo(productoIds: string[]): Promise<Map<string, number>> {
  if (productoIds.length === 0) return new Map();
  const filas = await conPrisma(
    (p) =>
      p.$queryRaw<{ producto_id: string; total: number }[]>`
      SELECT ri.producto_id::text AS producto_id, SUM(ri.cantidad)::int AS total
        FROM reserva_items ri
        JOIN reservas r ON r.id = ri.reserva_id
       WHERE r.estado = 'ACTIVA' AND r.vence_en > now()
         AND ri.producto_id = ANY(${productoIds}::uuid[])
       GROUP BY ri.producto_id`,
  );
  return new Map(filas.map((f) => [f.producto_id, Number(f.total)]));
}

/** Stock físico actual de los productos (cuando el llamador no lo trae). */
export async function stockFisico(productoIds: string[]): Promise<Map<string, number>> {
  const filas = await conPrisma((p) =>
    p.stock.findMany({
      where: { productoId: { in: productoIds } },
      select: { productoId: true, cantidad: true },
    }),
  );
  return new Map(filas.map((f) => [f.productoId, f.cantidad]));
}

export const fuenteFisicaPostgres: FuenteFisica = { reservadoActivo, stockFisico };
