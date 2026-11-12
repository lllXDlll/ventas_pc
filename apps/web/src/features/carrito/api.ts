// Llamadas del carrito y las reservas (specs carrito y reservas).
import { api, ErrorApi } from '@/lib/api-client';
import type { VistaCarrito } from '@/lib/carrito';

export interface VistaReserva {
  id: string;
  estado: string;
  venceEn: string;
  creadaEn: string;
  items: { producto: { id: string; nombre: string; precio: string }; cantidad: number }[];
  total: string;
}

export const cambiarCantidad = (itemId: string, cantidad: number) =>
  api<VistaCarrito>(`/carrito/items/${itemId}`, { metodo: 'PATCH', cuerpo: { cantidad } });

export const quitarItem = (itemId: string) =>
  api<VistaCarrito>(`/carrito/items/${itemId}`, { metodo: 'DELETE' });

export const reservar = () => api<VistaReserva>('/reservas', { metodo: 'POST' });

/** Reserva activa del cliente, o null si no tiene (404). */
export async function reservaActiva(): Promise<VistaReserva | null> {
  try {
    return await api<VistaReserva>('/reservas/activa');
  } catch (e) {
    if (e instanceof ErrorApi && (e.estado === 404 || e.estado === 401)) return null;
    throw e;
  }
}

export const cancelarReserva = (id: string) => api<void>(`/reservas/${id}`, { metodo: 'DELETE' });
