import { describe, expect, it } from 'vitest';
import {
  CODIGOS_REGLA,
  ESQUEMA_PARAMETROS,
  PARAMETROS_POR_DEFECTO,
  validarParametros,
} from './parametros';

describe('validarParametros (spec gestion-reglas)', () => {
  it('acepta y normaliza parámetros válidos de POTENCIA', () => {
    expect(validarParametros('POTENCIA', { margenPorcentaje: 30, consumoBaseW: 50 })).toEqual({
      ok: true,
      parametros: { margenPorcentaje: 30, consumoBaseW: 50 },
    });
  });

  it('rechaza un margen fuera de rango y nombra el parámetro', () => {
    const r = validarParametros('POTENCIA', { margenPorcentaje: 150, consumoBaseW: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain('margenPorcentaje');
  });

  it('rechaza un valor en cadena', () => {
    expect(validarParametros('POTENCIA', { margenPorcentaje: '20', consumoBaseW: 0 }).ok).toBe(
      false,
    );
  });

  it('rechaza decimales en parámetros enteros', () => {
    expect(validarParametros('POTENCIA', { margenPorcentaje: 20.5, consumoBaseW: 0 }).ok).toBe(
      false,
    );
  });

  it('exige todos los parámetros de POTENCIA', () => {
    const r = validarParametros('POTENCIA', { margenPorcentaje: 20 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain('consumoBaseW');
  });

  it('rechaza claves desconocidas en una regla sin parámetros', () => {
    const r = validarParametros('SOCKET', { tolerancia: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(/SOCKET.*tolerancia/);
  });

  it('acepta un objeto vacío en reglas sin parámetros y rechaza lo que no es objeto', () => {
    expect(validarParametros('RAM', {})).toEqual({ ok: true, parametros: {} });
    expect(validarParametros('RAM', [1]).ok).toBe(false);
    expect(validarParametros('RAM', null).ok).toBe(false);
  });

  it('los parámetros por defecto cumplen su propio esquema', () => {
    for (const c of CODIGOS_REGLA) {
      expect(validarParametros(c, PARAMETROS_POR_DEFECTO[c]).ok, c).toBe(true);
      expect(Object.keys(PARAMETROS_POR_DEFECTO[c]).sort()).toEqual(
        ESQUEMA_PARAMETROS[c].map((d) => d.nombre).sort(),
      );
    }
  });
});
