'use client';

import { keepPreviousData, useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  actualizarConfiguracion,
  crearConfiguracion,
  type Item,
  leerConfiguracion,
  producto,
  productosDeCategoria,
  validar,
} from '../api';

/** Devuelve el valor después de `ms` sin cambios (validación en vivo con antirrebote). */
function useAntirrebote<T>(valor: T, ms: number): T {
  const [diferido, setDiferido] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDiferido(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return diferido;
}

const clave = (items: Item[]) =>
  items
    .map((i) => `${i.productoId}:${i.cantidad}`)
    .sort()
    .join(',');

/** Validación en vivo: 300 ms de antirrebote y caché por la combinación de productos. */
export function useValidacion(items: Item[]) {
  const diferida = useAntirrebote(items, 300);
  return useQuery({
    queryKey: ['validacion', clave(diferida)],
    queryFn: () => validar(diferida),
    enabled: diferida.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export const useProductosDeCategoria = (categoria: string, activa: boolean) =>
  useQuery({
    queryKey: ['armador', 'categoria', categoria],
    queryFn: () => productosDeCategoria(categoria),
    enabled: activa,
  });

/** Datos de los productos elegidos (pueden no estar en la lista abierta). */
export const useProductosElegidos = (items: Item[]) =>
  useQueries({
    queries: items.map((i) => ({
      queryKey: ['producto', i.productoId],
      queryFn: () => producto(i.productoId),
      staleTime: 60_000,
    })),
  });

export const useConfiguracion = (id: string | null) =>
  useQuery({
    queryKey: ['configuracion', id],
    queryFn: () => leerConfiguracion(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });

export const useGuardarConfiguracion = () =>
  useMutation({
    mutationFn: ({ id, items }: { id: string | null; items: Item[] }) =>
      id ? actualizarConfiguracion(id, items) : crearConfiguracion(items),
  });
