// Llamadas del catálogo público y opciones de consulta compartidas por el render en el
// servidor (precarga) y los hooks del cliente (design D4 del Sprint 1.5).
import { api, ErrorApi } from '@/lib/api-client';
import type { Facetas, Pagina, Producto } from '@/lib/tipos';
import { aConsulta, type FiltrosCatalogo } from './filtros';

/** 24 por página: rejilla de 4 columnas en escritorio y 2 en móvil. */
export const POR_PAGINA = 24;

export const opcionesProductos = (f: FiltrosCatalogo) => ({
  queryKey: ['productos', f] as const,
  queryFn: () => {
    const consulta = aConsulta(f);
    const porPagina = `${consulta ? '&' : '?'}porPagina=${POR_PAGINA}`;
    return api<Pagina<Producto>>(`/productos${consulta}${porPagina}`);
  },
});

export const opcionesDestacados = () => ({
  queryKey: ['productos', 'destacados'] as const,
  queryFn: () => api<Pagina<Producto>>('/productos?porPagina=8&orden=precio_desc'),
});

export const opcionesProducto = (id: string) => ({
  queryKey: ['producto', id] as const,
  queryFn: () => api<Producto>(`/productos/${encodeURIComponent(id)}`),
});

export const opcionesFacetas = (categoria?: string) => ({
  queryKey: ['facetas', categoria ?? null] as const,
  queryFn: () => api<Facetas>(`/facetas${categoria ? `?categoria=${categoria}` : ''}`),
  staleTime: 5 * 60_000,
});

/** La API respondió 404 (producto inexistente o inactivo). */
export const esNoEncontrado = (e: unknown) => e instanceof ErrorApi && e.estado === 404;
