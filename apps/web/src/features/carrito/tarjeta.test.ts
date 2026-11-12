import { describe, expect, it } from 'vitest';
import { formatoCvv, formatoNumeroTarjeta, formatoVencimiento } from './tarjeta';

describe('formato de tarjeta (spec pagos)', () => {
  it('agrupa el número de 4 en 4 y descarta lo que no es dígito', () => {
    expect(formatoNumeroTarjeta('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatoNumeroTarjeta('4242-4242 42')).toBe('4242 4242 42');
    expect(formatoNumeroTarjeta('4242')).toBe('4242');
    expect(formatoNumeroTarjeta('1'.repeat(25)).replace(/ /g, '')).toHaveLength(19);
  });

  it('vencimiento MM/AA', () => {
    expect(formatoVencimiento('1')).toBe('1');
    expect(formatoVencimiento('12')).toBe('12/');
    expect(formatoVencimiento('12', true)).toBe('12');
    expect(formatoVencimiento('1228')).toBe('12/28');
    expect(formatoVencimiento('12/289')).toBe('12/28');
  });

  it('CVV: solo dígitos, hasta 4', () => {
    expect(formatoCvv('12a3')).toBe('123');
    expect(formatoCvv('123456')).toBe('1234');
  });
});
