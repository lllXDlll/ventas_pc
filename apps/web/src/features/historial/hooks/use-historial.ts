'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { esSinSesion } from '@/lib/sesion-requerida';
import { compra, compras, comprobante, configuraciones, revalidar } from '../api';

// Sin sesión no se reintenta: el contenedor redirige a /ingresar.
const reintentar = (n: number, e: unknown) => !esSinSesion(e) && n < 2;

export const useCompras = (pagina: number) =>
  useQuery({
    queryKey: ['historial', 'compras', pagina],
    queryFn: () => compras(pagina),
    retry: reintentar,
  });

export const useCompra = (id: string) =>
  useQuery({ queryKey: ['historial', 'compra', id], queryFn: () => compra(id), retry: reintentar });

export const useComprobante = (id: string) =>
  useQuery({
    queryKey: ['comprobante', id],
    queryFn: () => comprobante(id),
    retry: reintentar,
    staleTime: Infinity, // un comprobante no cambia
  });

export const useConfiguracionesHistorial = (pagina: number) =>
  useQuery({
    queryKey: ['historial', 'configuraciones', pagina],
    queryFn: () => configuraciones(pagina),
    retry: reintentar,
  });

/** Revalida y refresca la lista, porque el estado guardado puede haber cambiado. */
export function useRevalidar() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: revalidar,
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['historial', 'configuraciones'] }),
  });
}
