import { describe, expect, it } from 'vitest';
import {
  ATRIBUTOS_OBLIGATORIOS,
  CATEGORIAS,
  type CodigoCategoria,
  validarAtributos,
  validarTipo,
} from './atributos';

/** Atributos válidos mínimos para cada categoría. */
export const VALIDOS: Record<CodigoCategoria, Record<string, unknown>> = {
  PROCESADOR: { socket: 'AM5', potenciaConsumidaW: 105 },
  PLACA_MADRE: {
    socket: 'AM5',
    tipoRam: 'DDR5',
    maxModulosRam: 4,
    factorForma: 'ATX',
    interfacesAlmacenamiento: ['M.2', 'SATA'],
  },
  RAM: { tipoRam: 'DDR5', velocidadRam: 6000, modulos: 2 },
  TARJETA_GRAFICA: { potenciaConsumidaW: 220, largoMm: 300 },
  FUENTE: { potenciaEntregadaW: 750 },
  GABINETE: {
    factoresFormaSoportados: ['ATX', 'mATX'],
    largoGpuMaxMm: 360,
    altoDisipadorMaxMm: 165,
  },
  ALMACENAMIENTO: { interfaz: 'M.2' },
  EQUIPO_ARMADO: {},
};

describe('validarAtributos (spec catalogo)', () => {
  it.each(CATEGORIAS)('acepta los atributos válidos de %s', (categoria) => {
    expect(validarAtributos(categoria, VALIDOS[categoria])).toBeNull();
  });

  it.each(
    CATEGORIAS.flatMap((c) => Object.keys(ATRIBUTOS_OBLIGATORIOS[c]).map((a) => [c, a] as const)),
  )('%s sin "%s" se rechaza nombrando el atributo', (categoria, atributo) => {
    const resto = { ...VALIDOS[categoria] };
    delete resto[atributo];
    expect(validarAtributos(categoria, resto)).toContain(`"${atributo}"`);
  });

  it('rechaza un tipo inválido nombrando el atributo', () => {
    expect(validarAtributos('FUENTE', { potenciaEntregadaW: 'mucha' })).toContain(
      '"potenciaEntregadaW"',
    );
    expect(validarAtributos('FUENTE', { potenciaEntregadaW: 0 })).toContain('entero positivo');
    expect(validarAtributos('FUENTE', { potenciaEntregadaW: 1.5 })).not.toBeNull();
    expect(validarAtributos('PROCESADOR', { socket: '  ', potenciaConsumidaW: 65 })).toContain(
      '"socket"',
    );
    expect(
      validarAtributos('GABINETE', { ...VALIDOS.GABINETE, factoresFormaSoportados: [] }),
    ).toContain('lista');
  });

  it('acepta atributos adicionales no listados', () => {
    expect(validarAtributos('RAM', { ...VALIDOS.RAM, latenciaCl: 30, marca: 'X' })).toBeNull();
  });

  it('rechaza atributos que no son un objeto', () => {
    expect(validarAtributos('EQUIPO_ARMADO', null)).not.toBeNull();
    expect(validarAtributos('EQUIPO_ARMADO', [])).not.toBeNull();
  });
});

describe('validarTipo', () => {
  it('EQUIPO_ARMADO es EQUIPO y el resto COMPONENTE', () => {
    expect(validarTipo('EQUIPO_ARMADO', 'EQUIPO')).toBeNull();
    expect(validarTipo('RAM', 'COMPONENTE')).toBeNull();
    expect(validarTipo('RAM', 'EQUIPO')).toContain('COMPONENTE');
    expect(validarTipo('EQUIPO_ARMADO', 'COMPONENTE')).toContain('EQUIPO');
  });
});

describe('copia del frontend (apps/web/src/lib/atributos.ts)', () => {
  it('coincide con la tabla de la API', async () => {
    const web = await import('../../../web/src/lib/atributos');
    expect(web.ATRIBUTOS).toEqual(ATRIBUTOS_OBLIGATORIOS);
    expect([...web.CATEGORIAS]).toEqual([...CATEGORIAS]);
  });
});
