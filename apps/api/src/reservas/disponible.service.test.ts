import { describe, expect, it, vi } from 'vitest';
import { DisponibleDurableObject, NOMBRE_INVENTARIO } from './disponible.service';
import type { Inventario } from './inventario';

function namespaceFalso(respuesta: unknown) {
  const ping = vi.fn(async () => respuesta);
  const ns = {
    idFromName: vi.fn((nombre: string) => ({ nombre })),
    get: vi.fn(() => ({ ping })),
  };
  return { ns: ns as unknown as DurableObjectNamespace<Inventario>, ping, crudo: ns };
}

describe('DisponibleDurableObject', () => {
  it('ping usa el único objeto del catálogo y resuelve si responde ok', async () => {
    const { ns, ping, crudo } = namespaceFalso('ok');
    await new DisponibleDurableObject(ns).ping();
    expect(crudo.idFromName).toHaveBeenCalledWith(NOMBRE_INVENTARIO);
    expect(ping).toHaveBeenCalledOnce();
  });

  it('ping rechaza ante una respuesta inesperada', async () => {
    const { ns } = namespaceFalso('otra cosa');
    await expect(new DisponibleDurableObject(ns).ping()).rejects.toThrow();
  });

  it('disponibles devuelve el stock físico ya cargado, sin llamar al objeto (Sprint 1)', async () => {
    const { ns, crudo } = namespaceFalso('ok');
    const mapa = await new DisponibleDurableObject(ns).disponibles([
      { productoId: 'a', stockFisico: 7 },
      { productoId: 'b', stockFisico: 0 },
    ]);
    expect([...mapa]).toEqual([
      ['a', 7],
      ['b', 0],
    ]);
    expect(crudo.get).not.toHaveBeenCalled();
  });
});
