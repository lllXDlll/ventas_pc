// Tipos del asistente (spec asistente, design D1 del Sprint 5). Código puro: sin NestJS,
// Prisma ni Workers, para probarlo en Node.
import type { CategoriaPieza } from '../compatibilidad/motor/tipos';

export const USOS = ['OFICINA', 'ESTUDIO', 'GAMING', 'DISENO', 'OTRO'] as const;
export type Uso = (typeof USOS)[number];

export const NOMBRE_USO: Record<Uso, string> = {
  OFICINA: 'oficina',
  ESTUDIO: 'estudio',
  GAMING: 'gaming',
  DISENO: 'diseño',
  OTRO: 'uso general',
};

/** Orden de armado: lo que más restringe va primero (socket, RAM, factor de forma). */
export const CATEGORIAS_ARMADO: readonly CategoriaPieza[] = [
  'PROCESADOR',
  'PLACA_MADRE',
  'RAM',
  'TARJETA_GRAFICA',
  'GABINETE',
  'ALMACENAMIENTO',
  'FUENTE',
];

/** Categorías con exactamente una pieza (las demás admiten varias). */
export const UNICAS: readonly CategoriaPieza[] = [
  'PROCESADOR',
  'PLACA_MADRE',
  'TARJETA_GRAFICA',
  'FUENTE',
  'GABINETE',
];

/** Componente activo con disponible, tal como lo usan la preselección y el armador. */
export interface ProductoAsistente {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: CategoriaPieza;
  /** Precio en céntimos: las sumas y comparaciones son exactas. */
  precioCent: number;
  atributos: Record<string, unknown>;
  disponible: number;
}

export interface ItemRecomendado {
  producto: ProductoAsistente;
  cantidad: number;
  explicacion: string;
}

export const aCentimos = (soles: number | string) => Math.round(Number(soles) * 100);
export const aSoles = (centimos: number) => (centimos / 100).toFixed(2);
