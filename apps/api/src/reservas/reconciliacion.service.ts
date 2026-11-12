import { Injectable } from '@nestjs/common';
import { conPrisma } from '../datos/prisma';
import { DisponibleService } from './disponible.service';

/**
 * Reconciliación periódica (spec disponibilidad; design D1 del Sprint 3 y D5 del Sprint 6):
 * manda al almacén el stock físico de los productos activos y los ítems de las reservas
 * ACTIVA vigentes de Postgres, leídos en una sola consulta (misma instantánea). El objeto
 * descuenta la unión de esas reservas y las suyas, y corrige lo que difiera.
 */
@Injectable()
export class ReconciliacionService {
  constructor(private readonly disponible: DisponibleService) {}

  async reconciliar(): Promise<string[]> {
    const filas = await conPrisma(
      (p) =>
        p.$queryRaw<
          { tipo: 'F' | 'R'; productoId: string; cantidad: number; reservaId: string | null }[]
        >`
        SELECT 'F' AS tipo, s.producto_id::text AS "productoId", s.cantidad, NULL AS "reservaId"
          FROM stock s JOIN productos p ON p.id = s.producto_id
         WHERE p.activo
        UNION ALL
        SELECT 'R', i.producto_id::text, i.cantidad, r.id::text
          FROM reserva_items i JOIN reservas r ON r.id = i.reserva_id
         WHERE r.estado = 'ACTIVA' AND r.vence_en > now()`,
    );
    const fisicos = filas
      .filter((f) => f.tipo === 'F')
      .map((f) => ({ productoId: f.productoId, fisico: f.cantidad }));
    const reservas = filas
      .filter((f) => f.tipo === 'R')
      .map((f) => ({ reservaId: f.reservaId!, productoId: f.productoId, cantidad: f.cantidad }));
    return this.disponible.reconciliar(fisicos, reservas);
  }
}
