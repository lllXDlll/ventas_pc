import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Comprobador, verificarSalud } from './salud.service';

const ok = (nombre: Comprobador['nombre']): Comprobador => ({ nombre, comprobar: async () => {} });
const falla = (nombre: Comprobador['nombre'], mensaje: string): Comprobador => ({
  nombre,
  comprobar: async () => {
    throw new Error(mensaje);
  },
});

afterEach(() => vi.restoreAllMocks());

describe('verificarSalud', () => {
  it('con todas las dependencias activas está listo', async () => {
    const r = await verificarSalud([ok('postgres'), ok('almacen')], 100);
    expect(r).toEqual({ listo: true, dependencias: { postgres: 'ok', almacen: 'ok' } });
  });

  it('con Postgres caído no está listo e identifica a Postgres', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await verificarSalud([falla('postgres', 'ECONNREFUSED'), ok('almacen')], 100);
    expect(r).toEqual({ listo: false, dependencias: { postgres: 'falla', almacen: 'ok' } });
  });

  it('con el almacén caído no está listo e identifica al almacén', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await verificarSalud([ok('postgres'), falla('almacen', 'sin respuesta')], 100);
    expect(r).toEqual({ listo: false, dependencias: { postgres: 'ok', almacen: 'falla' } });
  });

  it('una dependencia que no responde a tiempo cuenta como falla', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lenta: Comprobador = { nombre: 'postgres', comprobar: () => new Promise(() => {}) };
    const r = await verificarSalud([lenta, ok('almacen')], 20);
    expect(r.dependencias.postgres).toBe('falla');
  });

  it('no expone la cadena de conexión ni el mensaje del driver en el resultado', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secreto = 'postgresql://usuario:clave-secreta@host/db: password authentication failed';
    const r = await verificarSalud([falla('postgres', secreto), ok('almacen')], 100);
    expect(JSON.stringify(r)).not.toContain('clave-secreta');
    expect(JSON.stringify(r)).not.toContain('authentication');
  });
});
