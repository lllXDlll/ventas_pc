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
