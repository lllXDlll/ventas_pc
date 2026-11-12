// Llamadas del armador (specs motor-compatibilidad, configuraciones y armador).
import { api, ErrorApi } from '@/lib/api-client';
import type { Pagina, Producto } from '@/lib/tipos';

export interface Item {
  productoId: string;
  cantidad: number;
}

export interface Rechazo {
  codigo: string;
  mensaje: string;
  productos: string[];
}

export interface Validacion {
  compatible: boolean;
  rechazos: Rechazo[];
}

export interface VistaConfiguracion extends Validacion {
  id: string;
  estado: 'VALIDA' | 'INVALIDA' | 'BORRADOR';
  total: string;
  agregable: boolean;
  faltantes: { productoId: string; disponible: number; cantidad: number }[];
  items: { producto: Producto & { activo: boolean }; cantidad: number }[];
}

export const validar = (items: Item[]) =>
  api<Validacion>('/compatibilidad/validar', { metodo: 'POST', cuerpo: { items } });

export const crearConfiguracion = (items: Item[]) =>
  api<VistaConfiguracion>('/configuraciones', { metodo: 'POST', cuerpo: { items } });

export const actualizarConfiguracion = (id: string, items: Item[]) =>
  api<VistaConfiguracion>(`/configuraciones/${id}`, { metodo: 'PATCH', cuerpo: { items } });

export const leerConfiguracion = (id: string) =>
  api<VistaConfiguracion>(`/configuraciones/${encodeURIComponent(id)}`);

/** Productos con stock de una categoría (el catálogo público ya filtra el disponible). */
export const productosDeCategoria = (categoria: string) =>
  api<Pagina<Producto>>(`/productos?categoria=${categoria}&porPagina=100`);

export const producto = (id: string) => api<Producto>(`/productos/${encodeURIComponent(id)}`);

export const sinSesion = (e: unknown) => e instanceof ErrorApi && e.estado === 401;
