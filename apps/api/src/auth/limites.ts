import { DurableObject } from 'cloudflare:workers';

/**
 * Contadores de límite de peticiones de registro e inicio de sesión (design.md D5).
 * Separado de Inventario para no cargar al objeto de reservas.
 * Sprint 0: solo se declara; la lógica es del Sprint 1.
 */
export class Limites extends DurableObject<Env> {
  async ping(): Promise<'ok'> {
    return 'ok';
  }
}
