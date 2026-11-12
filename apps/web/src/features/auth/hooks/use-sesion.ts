'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorApi } from '@/lib/api-client';
import { CLAVE_CARRITO } from '@/lib/carrito';
import { CLAVE_NOTIFICACIONES } from '@/lib/notificaciones';
import type { Usuario } from '@/lib/tipos';
import { cerrarSesion, type Credenciales, iniciarSesion, usuarioActual } from '../api';

export const CLAVE_SESION = ['me'] as const;

/** Usuario de la sesión: undefined mientras se consulta, null sin sesión (design D4). */
export function useSesion(): { usuario: Usuario | null | undefined } {
  const { data, isPending } = useQuery({
    queryKey: CLAVE_SESION,
    queryFn: async () => {
      try {
        return await usuarioActual();
      } catch (error) {
        // 401 = sin sesión; otro error (API caída) también se muestra como sin sesión.
        if (!(error instanceof ErrorApi) || error.estado !== 401) console.warn(error);
        return null;
      }
    },
    staleTime: 60_000,
  });
  return { usuario: isPending ? undefined : (data ?? null) };
}

export function useIniciarSesion() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (c: Credenciales) => iniciarSesion(c),
    onSuccess: (usuario) => {
      cliente.setQueryData(CLAVE_SESION, usuario);
      // Lo leído sin sesión (null) se vuelve a pedir: contador del carrito y campana.
      void cliente.invalidateQueries({ queryKey: CLAVE_CARRITO });
      void cliente.invalidateQueries({ queryKey: CLAVE_NOTIFICACIONES });
    },
  });
}

export function useCerrarSesion() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: cerrarSesion,
    onSettled: async () => {
      cliente.setQueryData(CLAVE_SESION, null);
      cliente.setQueryData(CLAVE_NOTIFICACIONES, null);
      cliente.setQueryData(CLAVE_CARRITO, null);
      await cliente.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}
