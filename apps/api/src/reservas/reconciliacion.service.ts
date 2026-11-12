import { Injectable } from '@nestjs/common';
import { conPrisma } from '../datos/prisma';
import { DisponibleService } from './disponible.service';

/**
 * Reconciliación periódica (spec disponibilidad, design D1 del Sprint 3): manda al almacén
 * el stock físico de los productos activos; el objeto descuenta sus propias reservas
 * vigentes y corrige lo que difiera.
 */
@Injectable()
export class ReconciliacionService {
  constructor(private readonly disponible: DisponibleService) {}

  async reconciliar(): Promise<string[]> {
    const filas = await conPrisma((p) =>
      p.stock.findMany({
        where: { producto: { activo: true } },
        select: { productoId: true, cantidad: true },
      }),
    );
    return this.disponible.reconciliar(
      filas.map((f) => ({ productoId: f.productoId, fisico: f.cantidad })),
    );
  }
}
