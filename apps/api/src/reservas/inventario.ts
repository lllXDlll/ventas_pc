import { DurableObject } from 'cloudflare:workers';

/**
 * Almacén de disponibilidad (opción B, design.md D5). Un único objeto para todo
 * el catálogo, para que la reserva de varios productos sea atómica.
 * Sprint 0: solo responde a ping; el prototipo de reservas llega en la tarea 7.5.
 */
export class Inventario extends DurableObject<Env> {
  async ping(): Promise<'ok'> {
    return 'ok';
  }
}
