// Historial de compras y configuraciones, y comprobantes (specs historial y comprobantes).
import { api } from '@/lib/api-client';

export interface PaginaHistorial<T> {
  elementos: T[];
  total: number;
  pagina: number;
}

export interface ResumenCompra {
  id: string;
  fecha: string;
  total: string;
  estado: 'PAGADA';
  productos: number;
  comprobante: { id: string; numero: string } | null;
}

export interface DetalleCompra extends Omit<ResumenCompra, 'productos'> {
  items: {
    producto: { id: string; nombre: string; marca: string | null; categoria: string };
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
  }[];
}

export interface Comprobante {
  id: string;
  numero: string;
  fecha: string;
  ordenId: string;
  cliente: string;
  items: {
    productoId: string;
    nombre: string;
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
  }[];
  total: string;
  tarjeta: { ultimos4: string } | null;
}

export interface ConfiguracionHistorial {
  id: string;
  origen: 'MANUAL' | 'IA' | string;
  presupuesto: string | null;
  uso: string | null;
  estado: 'VALIDA' | 'INVALIDA' | 'BORRADOR' | string;
  creadaEn: string;
  componentes: { productoId: string; nombre: string; categoria: string; cantidad: number }[];
}

export interface Revalidacion {
  id: string;
  estado: string;
  agregable: boolean;
  rechazos: { codigo: string; mensaje: string; productos: string[] }[];
  faltantes: { productoId: string; disponible: number; cantidad: number }[];
}

export const compras = (pagina: number) =>
  api<PaginaHistorial<ResumenCompra>>(`/historial/compras?pagina=${pagina}`);

export const compra = (id: string) => api<DetalleCompra>(`/historial/compras/${id}`);

export const comprobante = (id: string) => api<Comprobante>(`/comprobantes/${id}`);

export const configuraciones = (pagina: number) =>
  api<PaginaHistorial<ConfiguracionHistorial>>(`/historial/configuraciones?pagina=${pagina}`);

export const revalidar = (id: string) =>
  api<Revalidacion>(`/historial/configuraciones/${id}/revalidar`, { metodo: 'POST' });
