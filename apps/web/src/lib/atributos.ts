// Atributos obligatorios por categoría para los formularios del panel.
// COPIA de apps/api/src/catalogo/atributos.ts (design.md D8 del Sprint 1): si cambia allá,
// cambiar aquí. La API es la que valida; esto solo arma el formulario.

export type TipoAtributo = 'texto' | 'entero' | 'lista';

export const CATEGORIAS = [
  'PROCESADOR',
  'PLACA_MADRE',
  'RAM',
  'TARJETA_GRAFICA',
  'FUENTE',
  'GABINETE',
  'ALMACENAMIENTO',
  'EQUIPO_ARMADO',
] as const;

export type CodigoCategoria = (typeof CATEGORIAS)[number];

export const ATRIBUTOS: Record<CodigoCategoria, Record<string, TipoAtributo>> = {
  PROCESADOR: { socket: 'texto', potenciaConsumidaW: 'entero' },
  PLACA_MADRE: {
    socket: 'texto',
    tipoRam: 'texto',
    velocidadRamMaxMhz: 'entero',
    maxModulosRam: 'entero',
    factorForma: 'texto',
    interfacesAlmacenamiento: 'lista',
  },
  RAM: { tipoRam: 'texto', velocidadRam: 'entero', modulos: 'entero' },
  TARJETA_GRAFICA: { potenciaConsumidaW: 'entero', largoMm: 'entero' },
  FUENTE: { potenciaEntregadaW: 'entero' },
  GABINETE: {
    factoresFormaSoportados: 'lista',
    largoGpuMaxMm: 'entero',
    altoDisipadorMaxMm: 'entero',
  },
  ALMACENAMIENTO: { interfaz: 'texto' },
  EQUIPO_ARMADO: {},
};

/** Atributos opcionales conocidos (copia de ATRIBUTOS_OPCIONALES de la API). */
export const ATRIBUTOS_OPCIONALES: Partial<Record<CodigoCategoria, Record<string, TipoAtributo>>> =
  {
    PROCESADOR: { altoDisipadorMm: 'entero' },
  };

export const tipoDeCategoria = (c: CodigoCategoria) =>
  c === 'EQUIPO_ARMADO' ? 'EQUIPO' : 'COMPONENTE';

/** Convierte el texto de un campo del formulario al tipo del atributo. */
export function convertir(valor: string, tipo: TipoAtributo): unknown {
  const v = valor.trim();
  if (tipo === 'entero') return v === '' ? undefined : Number(v);
  if (tipo === 'lista') {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return v;
}

/** Nombres de las categorías (copia de NOMBRES_CATEGORIA de la API, comprobada por su prueba). */
export const NOMBRES_CATEGORIA: Record<CodigoCategoria, string> = {
  PROCESADOR: 'Procesador',
  PLACA_MADRE: 'Placa madre',
  RAM: 'Memoria RAM',
  TARJETA_GRAFICA: 'Tarjeta gráfica',
  FUENTE: 'Fuente de poder',
  GABINETE: 'Gabinete',
  ALMACENAMIENTO: 'Almacenamiento',
  EQUIPO_ARMADO: 'Equipo armado',
};

export function esCategoria(valor: unknown): valor is CodigoCategoria {
  return typeof valor === 'string' && (CATEGORIAS as readonly string[]).includes(valor);
}

/** Etiquetas legibles de los atributos técnicos (tabla de especificaciones y formularios). */
export const ETIQUETAS: Record<string, string> = {
  socket: 'Socket',
  potenciaConsumidaW: 'Consumo (W)',
  tipoRam: 'Tipo de RAM',
  maxModulosRam: 'Máximo de módulos de RAM',
  velocidadRamMaxMhz: 'Velocidad máxima de RAM (MHz)',
  altoDisipadorMm: 'Alto del disipador (mm)',
  factorForma: 'Factor de forma',
  interfacesAlmacenamiento: 'Interfaces de almacenamiento',
  velocidadRam: 'Velocidad (MHz)',
  modulos: 'Módulos',
  largoMm: 'Largo (mm)',
  potenciaEntregadaW: 'Potencia entregada (W)',
  factoresFormaSoportados: 'Factores de forma soportados',
  largoGpuMaxMm: 'Largo máximo de GPU (mm)',
  altoDisipadorMaxMm: 'Alto máximo del disipador (mm)',
  interfaz: 'Interfaz',
  descripcion: 'Descripción',
};

export const etiquetaAtributo = (nombre: string) => ETIQUETAS[nombre] ?? nombre;

/** Valor de un atributo como texto, con la unidad cuando el nombre la lleva. */
export function formatoAtributo(nombre: string, valor: unknown): string {
  if (Array.isArray(valor)) return valor.join(', ');
  if (valor !== null && typeof valor === 'object') return JSON.stringify(valor);
  const texto = String(valor);
  if (typeof valor === 'number' && nombre.endsWith('W')) return `${texto} W`;
  if (typeof valor === 'number' && nombre.endsWith('Mm')) return `${texto} mm`;
  if (typeof valor === 'number' && nombre.endsWith('Mhz')) return `${texto} MHz`;
  if (typeof valor === 'number' && nombre === 'velocidadRam') return `${texto} MHz`;
  return texto;
}

/** Hasta 3 atributos clave por categoría para los chips de la tarjeta de producto. */
const CLAVES_CHIPS: Record<CodigoCategoria, string[]> = {
  PROCESADOR: ['socket', 'potenciaConsumidaW'],
  PLACA_MADRE: ['socket', 'tipoRam', 'factorForma'],
  RAM: ['tipoRam', 'velocidadRam', 'modulos'],
  TARJETA_GRAFICA: ['potenciaConsumidaW', 'largoMm'],
  FUENTE: ['potenciaEntregadaW'],
  GABINETE: ['factoresFormaSoportados'],
  ALMACENAMIENTO: ['interfaz'],
  EQUIPO_ARMADO: [],
};

export function chipsDeAtributos(
  categoria: CodigoCategoria,
  atributos: Record<string, unknown>,
): string[] {
  return CLAVES_CHIPS[categoria]
    .filter((c) => atributos[c] !== undefined && atributos[c] !== '')
    .map((c) => (c === 'modulos' ? `${atributos[c]} módulos` : formatoAtributo(c, atributos[c])))
    .slice(0, 3);
}
