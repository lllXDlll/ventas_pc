// Asistente de IA (spec asistente).
import { api } from '@/lib/api-client';
import type { Producto } from '@/lib/tipos';
import type { Uso } from '@/lib/usos';

export interface Recomendacion {
  configuracion: {
    id: string;
    origen: string;
    estado: string;
    agregable: boolean;
    presupuesto: string | null;
    uso: string | null;
    total: string;
    items: { producto: Producto & { activo: boolean }; cantidad: number }[];
  };
  explicaciones: Record<string, string>;
  resumen: string;
  respaldo: boolean;
  consultas: { usadas: number; limite: number };
}

export interface EstadoLimite {
  limite: number;
  usadas: number;
  disponibleDesde: string | null;
}

export const recomendar = (presupuesto: number, uso: Uso) =>
  api<Recomendacion>('/asistente/recomendar', { metodo: 'POST', cuerpo: { presupuesto, uso } });

export const limite = () => api<EstadoLimite>('/asistente/limite');
