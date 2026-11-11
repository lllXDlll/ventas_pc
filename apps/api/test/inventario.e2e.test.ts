// Prototipo del almacén de disponibilidad (opción B): prueba 4 de HU-36b y
// reglas de concurrencia 4, 7 y 8 de la parte técnica.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Inventario } from '../src/reservas/inventario';

const MINUTO = 60_000;

/** Instancia aislada por prueba (en producción hay una sola: "catalogo"). */
function inventario() {
  const ns = env.INVENTARIO as DurableObjectNamespace<Inventario>;
  return ns.get(ns.idFromName(crypto.randomUUID()));
}

describe('Inventario: inicialización', () => {
  it('un producto sin disponible devuelve null, no cero', async () => {
    expect(await inventario().consultar('cpu-1')).toBeNull();
  });

  it('reservar un producto no inicializado devuelve NO_INICIALIZADO y no descuenta nada', async () => {
    const inv = inventario();
    await inv.reconstruir('cpu-1', 5);

    const r = await inv.reservar(
      [
        { productoId: 'cpu-1', cantidad: 1 },
        { productoId: 'gpu-1', cantidad: 1 },
      ],
      Date.now() + 10 * MINUTO,
    );

    expect(r).toEqual({ ok: false, motivo: 'NO_INICIALIZADO', productoIds: ['gpu-1'] });
    expect(await inv.consultar('cpu-1')).toBe(5);
  });

  it('reconstruir no sobrescribe un disponible existente', async () => {
    const inv = inventario();
    expect(await inv.reconstruir('cpu-1', 5)).toBe(true);
    expect(await inv.reconstruir('cpu-1', 99)).toBe(false);
    expect(await inv.consultar('cpu-1')).toBe(5);
  });
});

describe('Inventario: reserva todo o nada', () => {
  it('descuenta todos los productos cuando alcanzan', async () => {
    const inv = inventario();
    await inv.reconstruir('cpu-1', 5);
    await inv.reconstruir('ram-1', 10);

    const r = await inv.reservar(
      [
        { productoId: 'cpu-1', cantidad: 1 },
        { productoId: 'ram-1', cantidad: 2 },
      ],
      Date.now() + 10 * MINUTO,
    );

    expect(r.ok).toBe(true);
    expect(await inv.consultar('cpu-1')).toBe(4);
    expect(await inv.consultar('ram-1')).toBe(8);
  });

  it('si un producto no alcanza, no descuenta ninguno e indica cuál faltó', async () => {
    const inv = inventario();
    await inv.reconstruir('cpu-1', 5);
    await inv.reconstruir('gpu-1', 1);

    const r = await inv.reservar(
      [
        { productoId: 'cpu-1', cantidad: 1 },
        { productoId: 'gpu-1', cantidad: 2 },
      ],
      Date.now() + 10 * MINUTO,
    );

    expect(r).toEqual({ ok: false, motivo: 'INSUFICIENTE', productoId: 'gpu-1', disponible: 1 });
    expect(await inv.consultar('cpu-1')).toBe(5);
    expect(await inv.consultar('gpu-1')).toBe(1);
  });

  it('suma cantidades repetidas del mismo producto', async () => {
    const inv = inventario();
    await inv.reconstruir('ram-1', 3);

    const r = await inv.reservar(
      [
        { productoId: 'ram-1', cantidad: 2 },
        { productoId: 'ram-1', cantidad: 2 },
      ],
      Date.now() + 10 * MINUTO,
    );

    expect(r).toMatchObject({ ok: false, motivo: 'INSUFICIENTE', productoId: 'ram-1' });
    expect(await inv.consultar('ram-1')).toBe(3);
  });

  it('rechaza cantidades no positivas, reservas sin ítems y vencimientos pasados', async () => {
    const inv = inventario();
    await inv.reconstruir('cpu-1', 5);
    const vence = Date.now() + MINUTO;
    const invalida = { ok: false, motivo: 'INVALIDA' };
    expect(await inv.reservar([{ productoId: 'cpu-1', cantidad: 0 }], vence)).toMatchObject(
      invalida,
    );
    expect(await inv.reservar([{ productoId: 'cpu-1', cantidad: 1.5 }], vence)).toMatchObject(
      invalida,
    );
    expect(await inv.reservar([], vence)).toMatchObject(invalida);
    expect(
      await inv.reservar([{ productoId: 'cpu-1', cantidad: 1 }], Date.now() - 1),
    ).toMatchObject(invalida);
    expect(await inv.consultar('cpu-1')).toBe(5);
  });
});

describe('Inventario: expiración y cierre', () => {
  it('expirar devuelve al disponible las cantidades de las reservas vencidas', async () => {
    const inv = inventario();
    await inv.reconstruir('cpu-1', 5);
    const ahora = Date.now();
    const r = await inv.reservar(
      [{ productoId: 'cpu-1', cantidad: 2 }],
      ahora + MINUTO,
      'r1',
      ahora,
    );
    expect(r.ok).toBe(true);
    expect(await inv.consultar('cpu-1')).toBe(3);

    const exp = await inv.expirar(ahora + 2 * MINUTO);

    expect(exp.expiradas).toEqual(['r1']);
    expect(await inv.consultar('cpu-1')).toBe(5);
    expect((await inv.expirar(ahora + 3 * MINUTO)).expiradas).toEqual([]); // idempotente
  });

  it('cada reserva expira primero las vencidas (expiración perezosa)', async () => {
    const inv = inventario();
    await inv.reconstruir('cpu-1', 1);
    const ahora = Date.now();
    await inv.reservar([{ productoId: 'cpu-1', cantidad: 1 }], ahora + MINUTO, 'vieja', ahora);

    const r = await inv.reservar(
      [{ productoId: 'cpu-1', cantidad: 1 }],
      ahora + 5 * MINUTO,
      'nueva',
      ahora + 2 * MINUTO,
    );

    expect(r).toMatchObject({ ok: true, reservaId: 'nueva' });
    expect(await inv.consultar('cpu-1')).toBe(0);
  });

  it('cerrar una reserva confirmada no devuelve stock', async () => {
    const inv = inventario();
    await inv.reconstruir('cpu-1', 5);
    const ahora = Date.now();
    await inv.reservar([{ productoId: 'cpu-1', cantidad: 2 }], ahora + MINUTO, 'r1', ahora);

    expect(await inv.cerrar('r1')).toBe(true);
    expect(await inv.consultar('cpu-1')).toBe(3);
    // Ya cerrada, al vencer no se devuelve nada.
    expect((await inv.expirar(ahora + 2 * MINUTO)).expiradas).toEqual([]);
    expect(await inv.consultar('cpu-1')).toBe(3);
    expect(await inv.cerrar('r1')).toBe(false);
  });
});

describe('Inventario: concurrencia', () => {
  it('300 reservas concurrentes sobre 5 unidades dan exactamente 5 éxitos', async () => {
    const inv = inventario();
    await inv.reconstruir('gpu-limitada', 5);
    const vence = Date.now() + 10 * MINUTO;

    const resultados = await Promise.all(
      Array.from({ length: 300 }, () =>
        inv.reservar([{ productoId: 'gpu-limitada', cantidad: 1 }], vence),
      ),
    );

    expect(resultados.filter((r) => r.ok)).toHaveLength(5);
    expect(resultados.filter((r) => !r.ok && r.motivo === 'INSUFICIENTE')).toHaveLength(295);
    expect(await inv.consultar('gpu-limitada')).toBe(0);
  });

  // Medida para la cuota de filas escritas por día (prueba 4). Cuenta los índices.
  it('una reserva de un producto escribe 4 filas (reserva, su índice, ítem y disponible)', async () => {
    const inv = inventario();
    await inv.reconstruir('cpu-1', 5);
    const r = await inv.reservar([{ productoId: 'cpu-1', cantidad: 1 }], Date.now() + MINUTO);
    expect(r).toMatchObject({ ok: true, filasEscritas: 4 });
  });

  it('una reserva de tres productos escribe 8 filas', async () => {
    const inv = inventario();
    for (const p of ['cpu-1', 'ram-1', 'gpu-1']) await inv.reconstruir(p, 5);
    const r = await inv.reservar(
      ['cpu-1', 'ram-1', 'gpu-1'].map((productoId) => ({ productoId, cantidad: 1 })),
      Date.now() + MINUTO,
    );
    expect(r).toMatchObject({ ok: true, filasEscritas: 8 });
  });
});
