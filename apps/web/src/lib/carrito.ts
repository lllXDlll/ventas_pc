'use client';

// Acceso compartido al carrito (design D9 del Sprint 3): el catálogo, el armador y la
// cabecera agregan o leen el carrito sin importar features/carrito (regla de capas).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, ErrorApi } from './api-client';

export interface ProductoCarrito {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: { codigo: string; nombre: string };
  precio: string;
  activo: boolean;
  disponible: number;
  imagenUrl: string | null;
}

export interface ItemCarrito {
  id: string;
  tipo: 'PRODUCTO' | 'CONFIGURACION';
  cantidad: number;
  producto?: ProductoCarrito;
  configuracion?: { id: string; productos: { producto: ProductoCarrito; cantidad: number }[] };
  subtotal: string;
  sinDisponible: boolean;
}

export interface VistaCarrito {
  items: ItemCarrito[];
  total: string;
  cantidadProductos: number;
}

export const CLAVE_CARRITO = ['carrito'] as const;

export const sinSesion = (e: unknown) => e instanceof ErrorApi && e.estado === 401;

/** Carrito del usuario; null sin sesión (sin redirigir: la cabecera muestra 0). */
export function useCarrito() {
  return useQuery({
    queryKey: CLAVE_CARRITO,
    queryFn: async () => {
      try {
        return await api<VistaCarrito>('/carrito');
      } catch (e) {
        if (sinSesion(e)) return null;
        throw e;
      }
    },
    staleTime: 30_000,
  });
}

export type Agregable = { productoId: string } | { configuracionId: string };

/**
 * Agrega al carrito. Sin sesión lleva a iniciar sesión y vuelve a la página actual.
 */
export function useAgregarAlCarrito() {
  const cliente = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (item: Agregable & { cantidad?: number }) =>
      api<VistaCarrito>('/carrito', {
        metodo: 'POST',
        cuerpo: { ...item, cantidad: item.cantidad ?? 1 },
      }),
    onSuccess: (carrito) => cliente.setQueryData(CLAVE_CARRITO, carrito),
    onError: (e) => {
      if (sinSesion(e)) {
        const volver = `${window.location.pathname}${window.location.search}`;
        router.push(`/ingresar?volver=${encodeURIComponent(volver)}`);
      }
    },
  });
}
