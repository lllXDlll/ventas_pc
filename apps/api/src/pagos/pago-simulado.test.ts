import { describe, expect, it } from 'vitest';
import { autorizar, cumpleLuhn, TarjetaInvalida, ultimos4, type Tarjeta } from './pago-simulado';

const hoy = new Date('2026-11-12T12:00:00Z');
const tarjeta = (cambios: Partial<Tarjeta> = {}): Tarjeta => ({
  numero: '4242 4242 4242 4242',
  vencimiento: '12/28',
  cvv: '123',
  titular: 'Ana Pérez',
  ...cambios,
});
const motivo = (t: Tarjeta, forzar = '') => {
  try {
    autorizar(t, forzar, hoy);
    return '';
  } catch (e) {
    expect(e).toBeInstanceOf(TarjetaInvalida);
    return (e as Error).message;
  }
};

describe('pago simulado (spec pagos)', () => {
  it('Luhn', () => {
    expect(cumpleLuhn('4242424242424242')).toBe(true);
    expect(cumpleLuhn('4000000000000002')).toBe(true);
    expect(cumpleLuhn('4242424242424241')).toBe(false);
  });

  it('4242… aprueba y otra válida también', () => {
    expect(autorizar(tarjeta(), '', hoy)).toBe('APROBADO');
    expect(autorizar(tarjeta({ numero: '5555555555554444' }), '', hoy)).toBe('APROBADO');
  });

  it('4000 0000 0000 0002 rechaza', () => {
    expect(autorizar(tarjeta({ numero: '4000 0000 0000 0002' }), '', hoy)).toBe('RECHAZADO');
  });

  it('número inválido, vencida, CVV o titular: TarjetaInvalida', () => {
    expect(motivo(tarjeta({ numero: '4242 4242 4242 4241' }))).toMatch(/número/);
    expect(motivo(tarjeta({ numero: '42' }))).toMatch(/número/);
    expect(motivo(tarjeta({ vencimiento: '10/26' }))).toMatch(/vencida/);
    expect(motivo(tarjeta({ vencimiento: '13/28' }))).toMatch(/MM\/AA/);
    expect(motivo(tarjeta({ cvv: '12' }))).toMatch(/CVV/);
    expect(motivo(tarjeta({ titular: '  ' }))).toMatch(/titular/);
  });

  it('el mes en curso todavía vale', () => {
    expect(autorizar(tarjeta({ vencimiento: '11/26' }), '', hoy)).toBe('APROBADO');
  });

  it('PAGO_SIMULADO_FORZAR manda, pero no salta la validación', () => {
    expect(autorizar(tarjeta(), 'RECHAZAR', hoy)).toBe('RECHAZADO');
    expect(autorizar(tarjeta({ numero: '4000000000000002' }), 'APROBAR', hoy)).toBe('APROBADO');
    expect(motivo(tarjeta({ cvv: 'x' }), 'APROBAR')).toMatch(/CVV/);
  });

  it('últimos 4 dígitos', () => {
    expect(ultimos4('4242 4242 4242 4242')).toBe('4242');
  });
});
