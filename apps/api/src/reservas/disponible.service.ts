import type { Inventario } from './inventario';

/** Producto con su stock físico, tal como lo trae una consulta del catálogo. */
export interface ProductoConStock {
  productoId: string;
  stockFisico: number;
}

/**
 * Puerto único hacia el almacén de disponibilidad (arquitectura 2.2, design.md D5/D6;
 * spec catalogo, design.md D10 del Sprint 1). El resto del código depende de esta clase,
 * no del Durable Object.
 */
export abstract class DisponibleService {
  /** Resuelve si el almacén responde; lanza un error si no. */
  abstract ping(): Promise<void>;

  /** Disponible para vender de cada producto. */
  abstract disponibles(productos: readonly ProductoConStock[]): Promise<Map<string, number>>;
}

/** Nombre del único objeto Inventario para todo el catálogo (atomicidad multi-producto). */
export const NOMBRE_INVENTARIO = 'catalogo';

/**
 * Sprint 1: la salud consulta el Durable Object, pero la disponibilidad es el stock físico
 * que la consulta del catálogo ya trajo (sin consultas extra). El Sprint 3 la reemplaza por
 * el disponible del objeto Inventario sin cambiar las respuestas del catálogo.
 */
export class DisponibleDurableObject extends DisponibleService {
  constructor(private readonly inventarios: DurableObjectNamespace<Inventario>) {
    super();
  }

  async ping(): Promise<void> {
    const stub = this.inventarios.get(this.inventarios.idFromName(NOMBRE_INVENTARIO));
    const respuesta = await stub.ping();
    if (respuesta !== 'ok') throw new Error('respuesta inesperada del almacén');
  }

  async disponibles(productos: readonly ProductoConStock[]): Promise<Map<string, number>> {
    return new Map(productos.map((p) => [p.productoId, Math.max(0, p.stockFisico)]));
  }
}
