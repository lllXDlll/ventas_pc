import { describe, expect, it, vi } from 'vitest';
import { DisponibleDurableObject, NOMBRE_INVENTARIO } from './disponible.service';
import type { Inventario } from './inventario';

function namespaceFalso(respuesta: unknown, objeto: Record<string, unknown> = {}) {
  const ping = vi.fn(async () => respuesta);
  const ns = {
    idFromName: vi.fn((nombre: string) => ({ nombre })),
    get: vi.fn(() => ({ ping, ...objeto })),
  };
  return { ns: ns as unknown as DurableObjectNamespace<Inventario>, ping, crudo: ns };
}

const fuente = (reservado: Record<string, number> = {}, fisico: Record<string, number> = {}) => ({
  reservadoActivo: vi.fn(async () => new Map(Object.entries(reservado))),
  stockFisico: vi.fn(async () => new Map(Object.entries(fisico))),
});

describe('DisponibleDurableObject', () => {
  it('ping usa el único objeto del catálogo y resuelve si responde ok', async () => {
    const { ns, ping, crudo } = namespaceFalso('ok');
    await new DisponibleDurableObject(ns, fuente()).ping();
    expect(crudo.idFromName).toHaveBeenCalledWith(NOMBRE_INVENTARIO);
    expect(ping).toHaveBeenCalledOnce();
  });

  it('ping rechaza ante una respuesta inesperada', async () => {
    const { ns } = namespaceFalso('otra cosa');
    await expect(new DisponibleDurableObject(ns, fuente()).ping()).rejects.toThrow();
  });

  it('disponibles: una llamada al objeto cuando todos están inicializados (Sprint 3)', async () => {
    const consultarVarios = vi.fn(async () => ({ a: 5, b: 0 }));
    const reconstruirVarios = vi.fn();
    const { ns } = namespaceFalso('ok', { consultarVarios, reconstruirVarios });
    const mapa = await new DisponibleDurableObject(ns, fuente()).disponibles([
      { productoId: 'a', stockFisico: 7 },
      { productoId: 'b', stockFisico: 0 },
    ]);
    expect([...mapa]).toEqual([
      ['a', 5],
      ['b', 0],
    ]);
    expect(consultarVarios).toHaveBeenCalledOnce();
    expect(reconstruirVarios).not.toHaveBeenCalled();
  });

  it('disponibles: reconstruye en lote los no inicializados con físico − reservado', async () => {
    const consultarVarios = vi.fn(async () => ({ a: 5, b: null }));
    const reconstruirVarios = vi.fn(async () => ({ b: 4 }));
    const { ns } = namespaceFalso('ok', { consultarVarios, reconstruirVarios });
    const f = fuente({ b: 3 });
    const mapa = await new DisponibleDurableObject(ns, f).disponibles([
      { productoId: 'a', stockFisico: 7 },
      { productoId: 'b', stockFisico: 7 },
    ]);
    expect(reconstruirVarios).toHaveBeenCalledWith([{ productoId: 'b', cantidad: 4 }]);
    expect(f.stockFisico).not.toHaveBeenCalled(); // el físico ya venía en la consulta
    expect(mapa.get('b')).toBe(4);
  });

  it('reservar: ante NO_INICIALIZADO reconstruye y reintenta una vez', async () => {
    const reservar = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, motivo: 'NO_INICIALIZADO', productoIds: ['a'] })
      .mockResolvedValueOnce({ ok: true, reservaId: 'r', filasEscritas: 4 });
    const reconstruirVarios = vi.fn(async () => ({ a: 5 }));
    const { ns } = namespaceFalso('ok', { reservar, reconstruirVarios });
    const r = await new DisponibleDurableObject(ns, fuente({}, { a: 5 })).reservar(
      [{ productoId: 'a', cantidad: 1 }],
      Date.now() + 60_000,
      'r',
    );
    expect(r.ok).toBe(true);
    expect(reservar).toHaveBeenCalledTimes(2);
    expect(reconstruirVarios).toHaveBeenCalledWith([{ productoId: 'a', cantidad: 5 }]);
  });
});
