'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { opcionesDestacados, opcionesFacetas, opcionesProducto, opcionesProductos } from '../api';
import type { FiltrosCatalogo } from '../filtros';

// Hooks de lectura del catálogo (TanStack Query, design D4 del Sprint 1.5).

/** Mantiene la página anterior mientras llega la nueva: cambiar un filtro no parpadea. */
export const useProductos = (f: FiltrosCatalogo) =>
  useQuery({ ...opcionesProductos(f), placeholderData: keepPreviousData });

export const useDestacados = () => useQuery(opcionesDestacados());

export const useProducto = (id: string) => useQuery(opcionesProducto(id));

export const useFacetas = (categoria?: string) => useQuery(opcionesFacetas(categoria));
