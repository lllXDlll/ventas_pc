// Notificaciones del usuario (spec notificaciones).
import { api, ErrorApi } from '@/lib/api-client';

export interface Notificacion {
  id: string;
  tipo: 'PRODUCTO_AGOTADO' | 'COMPRA_CONFIRMADA' | string;
  mensaje: string;
  leida: boolean;
  creadaEn: string;
}

export interface ListaNotificaciones {
  notificaciones: Notificacion[];
  noLeidas: number;
}

/** Las últimas notificaciones, o null sin sesión (la campana no se muestra). */
export async function listarNotificaciones(): Promise<ListaNotificaciones | null> {
  try {
    return await api<ListaNotificaciones>('/notificaciones');
  } catch (e) {
    if (e instanceof ErrorApi && e.estado === 401) return null;
    throw e;
  }
}

export const marcarLeida = (id: string) =>
  api<Notificacion>(`/notificaciones/${id}/leida`, { metodo: 'PATCH' });
