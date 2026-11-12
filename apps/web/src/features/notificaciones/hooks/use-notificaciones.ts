'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CLAVE_NOTIFICACIONES } from '@/lib/notificaciones';
import { type ListaNotificaciones, listarNotificaciones, marcarLeida } from '../api';

/**
 * Notificaciones del usuario: cada 60 s solo con la pestaña visible y sin sesión, nunca
 * (design D6 del Sprint 4). El carrito invalida la clave después de reservar o pagar.
 */
export const useNotificaciones = () =>
  useQuery({
    queryKey: CLAVE_NOTIFICACIONES,
    queryFn: listarNotificaciones,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (q) => (q.state.data ? 60_000 : false),
  });

/** Marca una como leída y actualiza la lista en caché sin volver a pedirla. */
export function useMarcarLeida() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: marcarLeida,
    onSuccess: (n) =>
      cliente.setQueryData<ListaNotificaciones | null>(CLAVE_NOTIFICACIONES, (lista) => {
        if (!lista) return lista;
        const antes = lista.notificaciones.find((x) => x.id === n.id);
        return {
          notificaciones: lista.notificaciones.map((x) => (x.id === n.id ? n : x)),
          noLeidas: antes && !antes.leida ? Math.max(0, lista.noLeidas - 1) : lista.noLeidas,
        };
      }),
  });
}
