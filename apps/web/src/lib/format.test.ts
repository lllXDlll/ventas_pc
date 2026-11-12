import { describe, expect, it } from 'vitest';
import { formatoContador, formatoFecha, formatoHora, formatoPrecio } from './format';

describe('formatos', () => {
  it('contador de la campana y del carrito', () => {
    expect(formatoContador(0)).toBe('0');
    expect(formatoContador(9)).toBe('9');
    expect(formatoContador(10)).toBe('9+');
  });

  it('precio en soles', () => {
    expect(formatoPrecio('1299.00')).toBe('S/ 1,299.00');
  });

  it('fecha con y sin hora', () => {
    const iso = '2026-11-12T15:30:00Z';
    expect(formatoFecha(iso, true)).toMatch(/2026/);
    expect(formatoFecha(iso).length).toBeGreaterThan(formatoFecha(iso, true).length);
  });
});

describe('hora de cupo del asistente', () => {
  it('HH:MM en 24 horas', () => {
    expect(formatoHora('2026-11-12T15:05:00Z')).toMatch(/^\d{2}:\d{2}$/);
  });
});
