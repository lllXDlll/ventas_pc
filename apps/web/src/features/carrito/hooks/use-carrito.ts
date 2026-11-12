'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { CLAVE_CARRITO, type VistaCarrito } from '@/lib/carrito';
import { cambiarCantidad, cancelarReserva, quitarItem, reservaActiva, reservar } from '../api';

const CLAVE_RESERVA = ['reserva', 'activa'] as const;

/** Mutaciones del carrito: la respuesta reemplaza el carrito en caché. */
export function useEditarCarrito() {
  const cliente = useQueryClient();
  const poner = (c: VistaCarrito) => cliente.setQueryData(CLAVE_CARRITO, c);
  return {
    cantidad: useMutation({
      mutationFn: ({ id, cantidad }: { id: string; cantidad: number }) =>
        cambiarCantidad(id, cantidad),
      onSuccess: poner,
    }),
    quitar: useMutation({ mutationFn: (id: string) => quitarItem(id), onSuccess: poner }),
  };
}

export const useReservaActiva = () =>
  useQuery({ queryKey: CLAVE_RESERVA, queryFn: reservaActiva, staleTime: 0 });

export function useReservar() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: reservar,
    onSuccess: (r) => cliente.setQueryData(CLAVE_RESERVA, r),
    // El disponible cambió: el carrito vuelve a pedir sus marcas de stock.
    onSettled: () => cliente.invalidateQueries({ queryKey: CLAVE_CARRITO }),
  });
}

export function useCancelarReserva() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: cancelarReserva,
    onSuccess: () => cliente.setQueryData(CLAVE_RESERVA, null),
    onSettled: () => cliente.invalidateQueries({ queryKey: CLAVE_CARRITO }),
  });
}

/** Milisegundos restantes hasta `vence`, actualizados cada segundo. */
export function useRestante(vence: string | undefined): number {
  const calcular = () => (vence ? Math.max(0, new Date(vence).getTime() - Date.now()) : 0);
  const [restante, setRestante] = useState(calcular);
  useEffect(() => {
    setRestante(calcular());
    if (!vence) return;
    const t = setInterval(() => setRestante(calcular()), 1000);
    return () => clearInterval(t);
  }, [vence]);
  return restante;
}
