// Atributos técnicos obligatorios por categoría (spec catalogo, design.md D8 del Sprint 1).
// Son los nombres que leerá el motor de reglas del Sprint 2. Se admiten atributos
// adicionales no listados. Función pura: sin dependencias de infraestructura.

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
export type TipoProducto = 'COMPONENTE' | 'EQUIPO';
type TipoAtributo = 'texto' | 'entero' | 'lista';

export const ATRIBUTOS_OBLIGATORIOS: Readonly<
  Record<CodigoCategoria, Readonly<Record<string, TipoAtributo>>>
> = {
  PROCESADOR: { socket: 'texto', potenciaConsumidaW: 'entero' },
  PLACA_MADRE: {
    socket: 'texto',
    tipoRam: 'texto',
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

export const NOMBRES_CATEGORIA: Readonly<Record<CodigoCategoria, string>> = {
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

/** Tipo que corresponde a cada categoría: EQUIPO_ARMADO es EQUIPO; el resto, COMPONENTE. */
export function tipoDeCategoria(categoria: CodigoCategoria): TipoProducto {
  return categoria === 'EQUIPO_ARMADO' ? 'EQUIPO' : 'COMPONENTE';
}

function cumpleTipo(valor: unknown, tipo: TipoAtributo): boolean {
  switch (tipo) {
    case 'texto':
      return typeof valor === 'string' && valor.trim().length > 0;
    case 'entero':
      return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
    case 'lista':
      return (
        Array.isArray(valor) &&
        valor.length > 0 &&
        valor.every((v) => typeof v === 'string' && v.trim().length > 0)
      );
  }
}

const DESCRIPCION_TIPO: Record<TipoAtributo, string> = {
  texto: 'un texto no vacío',
  entero: 'un entero positivo',
  lista: 'una lista no vacía de textos',
};

/** Devuelve el primer error de validación de los atributos, o null si son válidos. */
export function validarAtributos(categoria: CodigoCategoria, atributos: unknown): string | null {
  if (typeof atributos !== 'object' || atributos === null || Array.isArray(atributos)) {
    return 'atributos debe ser un objeto';
  }
  const valores = atributos as Record<string, unknown>;
  for (const [nombre, tipo] of Object.entries(ATRIBUTOS_OBLIGATORIOS[categoria])) {
    if (!(nombre in valores)) return `falta el atributo obligatorio "${nombre}"`;
    if (!cumpleTipo(valores[nombre], tipo)) {
      return `el atributo "${nombre}" debe ser ${DESCRIPCION_TIPO[tipo]}`;
    }
  }
  return null;
}

/** Error si el tipo no corresponde a la categoría, o null. */
export function validarTipo(categoria: CodigoCategoria, tipo: TipoProducto): string | null {
  const esperado = tipoDeCategoria(categoria);
  return tipo === esperado
    ? null
    : `un producto de la categoría ${categoria} debe ser de tipo ${esperado}`;
}
