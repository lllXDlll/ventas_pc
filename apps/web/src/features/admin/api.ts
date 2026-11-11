// Llamadas del panel administrativo (specs catalogo e imagenes-producto).
import { api } from '@/lib/api-client';
import type { CodigoCategoria } from '@/lib/atributos';
import type { Pagina, ProductoAdmin } from '@/lib/tipos';

export interface FiltrosAdmin {
  q?: string;
  categoria?: CodigoCategoria;
}

export interface NuevoProducto {
  nombre: string;
  marca: string;
  categoria: CodigoCategoria;
  tipo: 'COMPONENTE' | 'EQUIPO';
  precio: string;
  stockInicial: number;
  atributos: Record<string, unknown>;
}

export interface CambiosProducto {
  nombre?: string;
  marca?: string;
  precio?: string;
  activo?: boolean;
  atributos?: Record<string, unknown>;
}

export const opcionesProductosAdmin = (f: FiltrosAdmin) => ({
  queryKey: ['admin', 'productos', f] as const,
  queryFn: () => {
    const params = new URLSearchParams();
    if (f.q && f.q.trim().length >= 2) params.set('q', f.q.trim());
    if (f.categoria) params.set('categoria', f.categoria);
    const consulta = params.toString();
    return api<Pagina<ProductoAdmin>>(`/admin/productos${consulta ? `?${consulta}` : ''}`);
  },
});

export const crearProducto = (p: NuevoProducto) =>
  api<ProductoAdmin>('/admin/productos', { metodo: 'POST', cuerpo: p });

export const actualizarProducto = (id: string, cambios: CambiosProducto) =>
  api<ProductoAdmin>(`/admin/productos/${id}`, { metodo: 'PATCH', cuerpo: cambios });

export const actualizarStock = (id: string, cantidad: number, version: number) =>
  api<{ cantidad: number; version: number }>(`/admin/stock/${id}`, {
    metodo: 'PATCH',
    cuerpo: { cantidad, version },
  });

export const subirImagen = (id: string, archivo: File) =>
  api<{ imagenUrl: string }>(`/admin/productos/${id}/imagen`, { metodo: 'PUT', archivo });

export const quitarImagen = (id: string) =>
  api<void>(`/admin/productos/${id}/imagen`, { metodo: 'DELETE' });
