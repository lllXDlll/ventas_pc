import { describe, expect, it } from 'vitest';
import { rangoDeFechas } from './rango';

const ok = (r: ReturnType<typeof rangoDeFechas>) => {
  if (!r.ok) throw new Error(r.mensaje);
  return r.rango;
};

describe('rangoDeFechas (spec reportes)', () => {
  it('sin parámetros son los últimos 30 días incluido hoy, en Lima', () => {
    // 2026-11-30 a las 22:00 de Lima ya es el 1 de diciembre en UTC.
    const r = ok(rangoDeFechas({}, new Date('2026-12-01T03:00:00Z')));
    expect([r.desde, r.hasta, r.dias.length]).toEqual(['2026-11-01', '2026-11-30', 30]);
  });

  it('el intervalo va de las 00:00 de Lima de desde a las 00:00 del día siguiente a hasta', () => {
    const r = ok(rangoDeFechas({ desde: '2026-11-10', hasta: '2026-11-10' }));
    expect(r.inicio.toISOString()).toBe('2026-11-10T05:00:00.000Z');
    expect(r.fin.toISOString()).toBe('2026-11-11T05:00:00.000Z');
    // Una orden a las 23:30 de Lima del día 10 (04:30 UTC del 11) entra en el rango.
    const orden = new Date('2026-11-11T04:30:00Z');
    expect(orden >= r.inicio && orden < r.fin).toBe(true);
  });

  it('solo desde llega hasta hoy', () => {
    const r = ok(rangoDeFechas({ desde: '2026-11-25' }, new Date('2026-11-30T12:00:00Z')));
    expect([r.desde, r.hasta]).toEqual(['2026-11-25', '2026-11-30']);
  });

  it('solo hasta cubre 30 días hacia atrás', () => {
    const r = ok(rangoDeFechas({ hasta: '2026-03-01' }));
    expect(r.desde).toBe('2026-01-31');
  });

  it('rechaza el rango invertido, más de 366 días y fechas que no existen', () => {
    expect(rangoDeFechas({ desde: '2026-11-20', hasta: '2026-11-01' }).ok).toBe(false);
    expect(rangoDeFechas({ desde: '2025-01-01', hasta: '2026-01-02' }).ok).toBe(false);
    expect(ok(rangoDeFechas({ desde: '2025-01-01', hasta: '2026-01-01' })).dias.length).toBe(366);
    expect(rangoDeFechas({ desde: '2026-02-30', hasta: '2026-03-01' }).ok).toBe(false);
    expect(rangoDeFechas({ desde: '26-11-01', hasta: '2026-11-02' }).ok).toBe(false);
  });
});
