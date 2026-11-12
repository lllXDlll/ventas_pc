// Tipos del motor de compatibilidad (design D1 del Sprint 2). Código puro: sin NestJS,
// Prisma ni Workers, para reutilizarlo en el carrito (Sprint 3) y la IA (Sprint 5).
import type { CodigoRegla } from './parametros';

export type CategoriaPieza =
  | 'PROCESADOR'
  | 'PLACA_MADRE'
  | 'RAM'
  | 'TARJETA_GRAFICA'
  | 'FUENTE'
  | 'GABINETE'
  | 'ALMACENAMIENTO';

/** Un producto elegido, con su cantidad. */
export interface Pieza {
  id: string;
  nombre: string;
  categoria: CategoriaPieza;
  atributos: Record<string, unknown>;
  cantidad: number;
}

/** Piezas agrupadas por su papel en el armado. */
export interface ConfiguracionEvaluable {
  procesador?: Pieza;
  placa?: Pieza;
  gpu?: Pieza;
  fuente?: Pieza;
  gabinete?: Pieza;
  ram: Pieza[];
  almacenamiento: Pieza[];
}

export interface Rechazo {
  codigo: CodigoRegla;
  /** En lenguaje claro: nombra las piezas y la característica que no coincide. */
  mensaje: string;
  /** Identificadores de los productos involucrados. */
  productos: string[];
}

export type Parametros = Record<string, number>;

/** Una regla: devuelve [] si es compatible o le faltan las piezas que compara. */
export interface Regla {
  readonly codigo: CodigoRegla;
  validar(configuracion: ConfiguracionEvaluable, parametros: Parametros): Rechazo[];
}

/** Agrupa las piezas por categoría. La composición (una por categoría única) la valida el servicio. */
export function agrupar(piezas: Pieza[]): ConfiguracionEvaluable {
  const primera = (c: CategoriaPieza) => piezas.find((p) => p.categoria === c);
  return {
    procesador: primera('PROCESADOR'),
    placa: primera('PLACA_MADRE'),
    gpu: primera('TARJETA_GRAFICA'),
    fuente: primera('FUENTE'),
    gabinete: primera('GABINETE'),
    ram: piezas.filter((p) => p.categoria === 'RAM'),
    almacenamiento: piezas.filter((p) => p.categoria === 'ALMACENAMIENTO'),
  };
}

/** Texto de un atributo, o undefined si no es un texto no vacío. */
export function texto(pieza: Pieza | undefined, nombre: string): string | undefined {
  const v = pieza?.atributos[nombre];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Entero positivo de un atributo, o undefined. */
export function entero(pieza: Pieza | undefined, nombre: string): number | undefined {
  const v = pieza?.atributos[nombre];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Lista de textos de un atributo, o []. */
export function lista(pieza: Pieza | undefined, nombre: string): string[] {
  const v = pieza?.atributos[nombre];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
