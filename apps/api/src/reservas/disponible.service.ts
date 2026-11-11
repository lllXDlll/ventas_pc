import type { Inventario } from './inventario';

/**
 * Puerto único hacia el almacén de disponibilidad (arquitectura 2.2, design.md D5/D6).
 * El resto del código depende de esta clase, no del Durable Object.
 * Sprint 0: solo ping. Las operaciones de reserva llegan en el Sprint 3.
 */
export abstract class DisponibleService {
  /** Resuelve si el almacén responde; lanza un error si no. */
  abstract ping(): Promise<void>;
}

/** Nombre del único objeto Inventario para todo el catálogo (atomicidad multi-producto). */
export const NOMBRE_INVENTARIO = 'catalogo';

export class DisponibleDurableObject extends DisponibleService {
  constructor(private readonly inventarios: DurableObjectNamespace<Inventario>) {
    super();
  }

  async ping(): Promise<void> {
    const stub = this.inventarios.get(this.inventarios.idFromName(NOMBRE_INVENTARIO));
    const respuesta = await stub.ping();
    if (respuesta !== 'ok') throw new Error('respuesta inesperada del almacén');
  }
}
