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

// ───────────── Reglas y reportes (Sprint 6: specs gestion-reglas y reportes) ─────────────

export interface DescripcionParametro {
  nombre: string;
  etiqueta: string;
  unidad: string;
  min: number;
  max: number;
  entero: boolean;
}

export interface Regla {
  codigo: string;
  nombre: string;
  activa: boolean;
  parametros: Record<string, number>;
  descripcion: DescripcionParametro[];
}

export const opcionesReglas = () => ({
  queryKey: ['admin', 'reglas'] as const,
  queryFn: () => api<Regla[]>('/admin/reglas'),
});

export const actualizarRegla = (
  codigo: string,
  cambios: { activa?: boolean; parametros?: Record<string, number> },
) => api<Regla>(`/admin/reglas/${codigo}`, { metodo: 'PATCH', cuerpo: cambios });

export interface RangoFechas {
  desde?: string;
  hasta?: string;
}

const conRango = (ruta: string, r: RangoFechas) => {
  const params = new URLSearchParams();
  if (r.desde) params.set('desde', r.desde);
  if (r.hasta) params.set('hasta', r.hasta);
  const q = params.toString();
  return q ? `${ruta}?${q}` : ruta;
};

export interface ReporteVentas {
  rango: { desde: string; hasta: string };
  totalVendido: string;
  ordenes: number;
  ticketPromedio: string;
  productos: { productoId: string; nombre: string; unidades: number; importe: string }[];
  serie: { fecha: string; total: string; ordenes: number }[];
}

export interface ReporteAsistente {
  rango: { desde: string; hasta: string };
  consultas: number;
  conRespaldo: number;
  porcentajeRespaldo: number;
  latenciaPromedioMs: number;
  porUso: { uso: string; consultas: number; porcentajeRespaldo: number }[];
  motivos: { motivo: string; consultas: number }[];
  tokens: { entrada: number; salida: number };
  modelo: string;
  costoEstimadoUsd: number;
}

export const opcionesReporteVentas = (r: RangoFechas) => ({
  queryKey: ['admin', 'reportes', 'ventas', r] as const,
  queryFn: () => api<ReporteVentas>(conRango('/admin/reportes/ventas', r)),
});

export const opcionesReporteAsistente = (r: RangoFechas) => ({
  queryKey: ['admin', 'reportes', 'asistente', r] as const,
  queryFn: () => api<ReporteAsistente>(conRango('/admin/reportes/asistente', r)),
});
