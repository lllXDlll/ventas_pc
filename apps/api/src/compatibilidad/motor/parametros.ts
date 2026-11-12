// Códigos de regla y parámetros por defecto (spec motor-compatibilidad, design D2 del
// Sprint 2). Fuente única para el motor y para la semilla de reglas_compatibilidad.

export const CODIGOS_REGLA = [
  'SOCKET',
  'RAM',
  'POTENCIA',
  'DIMENSIONES',
  'FACTOR_FORMA',
  'ALMACENAMIENTO',
] as const;

export type CodigoRegla = (typeof CODIGOS_REGLA)[number];

export interface ParametrosPotencia {
  /** Margen sobre el consumo estimado, en porcentaje (20 = 20 %). */
  margenPorcentaje: number;
  /** Consumo fijo del resto de componentes (placa, RAM, almacenamiento), en vatios. */
  consumoBaseW: number;
}

export const PARAMETROS_POR_DEFECTO: Readonly<Record<CodigoRegla, Record<string, number>>> = {
  SOCKET: {},
  RAM: {},
  POTENCIA: { margenPorcentaje: 20, consumoBaseW: 0 } satisfies ParametrosPotencia,
  DIMENSIONES: {},
  FACTOR_FORMA: {},
  ALMACENAMIENTO: {},
};
