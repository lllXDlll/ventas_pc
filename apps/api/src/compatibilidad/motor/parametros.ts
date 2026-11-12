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

// ───────────── Esquema de parámetros por regla (Sprint 6, spec gestion-reglas, D1) ─────────────

/** Descripción de un parámetro editable: la usa la validación y el panel arma sus campos con ella. */
export interface DescripcionParametro {
  nombre: string;
  etiqueta: string;
  unidad: string;
  min: number;
  max: number;
  entero: boolean;
}

export const NOMBRE_REGLA: Readonly<Record<CodigoRegla, string>> = {
  SOCKET: 'Socket del procesador y la placa',
  RAM: 'Tipo, velocidad y módulos de memoria',
  POTENCIA: 'Potencia de la fuente',
  DIMENSIONES: 'Medidas de la tarjeta gráfica y el disipador en el gabinete',
  FACTOR_FORMA: 'Formato de la placa en el gabinete',
  ALMACENAMIENTO: 'Interfaz del almacenamiento',
};

export const ESQUEMA_PARAMETROS: Readonly<Record<CodigoRegla, readonly DescripcionParametro[]>> = {
  SOCKET: [],
  RAM: [],
  POTENCIA: [
    {
      nombre: 'margenPorcentaje',
      etiqueta: 'Margen sobre el consumo',
      unidad: '%',
      min: 0,
      max: 100,
      entero: true,
    },
    {
      nombre: 'consumoBaseW',
      etiqueta: 'Consumo del resto de componentes',
      unidad: 'W',
      min: 0,
      max: 500,
      entero: true,
    },
  ],
  DIMENSIONES: [],
  FACTOR_FORMA: [],
  ALMACENAMIENTO: [],
};

export type ResultadoParametros =
  { ok: true; parametros: Record<string, number> } | { ok: false; mensaje: string };

/**
 * Valida los parámetros enviados para una regla. Se reemplazan completos: todos los del
 * esquema son obligatorios y no se admite ninguna clave más.
 */
export function validarParametros(codigo: CodigoRegla, valor: unknown): ResultadoParametros {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return { ok: false, mensaje: 'Los parámetros deben ser un objeto.' };
  }
  const esquema = ESQUEMA_PARAMETROS[codigo];
  const entrada = valor as Record<string, unknown>;
  for (const clave of Object.keys(entrada)) {
    if (!esquema.some((d) => d.nombre === clave)) {
      return {
        ok: false,
        mensaje: esquema.length
          ? `La regla ${codigo} no admite el parámetro «${clave}».`
          : `La regla ${codigo} no admite parámetros («${clave}»).`,
      };
    }
  }
  const parametros: Record<string, number> = {};
  for (const d of esquema) {
    const v = entrada[d.nombre];
    if (v === undefined) return { ok: false, mensaje: `Falta el parámetro «${d.nombre}».` };
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, mensaje: `«${d.nombre}» debe ser un número.` };
    }
    if (d.entero && !Number.isInteger(v)) {
      return { ok: false, mensaje: `«${d.nombre}» debe ser un número entero.` };
    }
    if (v < d.min || v > d.max) {
      return {
        ok: false,
        mensaje: `«${d.nombre}» debe estar entre ${d.min} y ${d.max} ${d.unidad}.`,
      };
    }
    parametros[d.nombre] = v;
  }
  return { ok: true, parametros };
}
