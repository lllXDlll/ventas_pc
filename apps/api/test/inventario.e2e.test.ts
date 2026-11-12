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

describe('Inventario: métodos del Sprint 3', () => {
  it('consultarVarios: una llamada, null para los no inicializados', async () => {
    const inv = inventario();
    await inv.reconstruir('a', 3);
    expect(await inv.consultarVarios(['a', 'b'])).toEqual({ a: 3, b: null });
    expect(await inv.consultarVarios([])).toEqual({});
  });

  it('reconstruirVarios: inserta los que faltan sin sobrescribir y devuelve lo vigente', async () => {
    const inv = inventario();
    await inv.reconstruir('a', 3);
    const r = await inv.reconstruirVarios([
      { productoId: 'a', cantidad: 9 },
      { productoId: 'b', cantidad: 4 },
    ]);
    expect(r).toEqual({ a: 3, b: 4 });
  });

  it('liberar: devuelve el stock y borra la reserva; false si ya no existe', async () => {
    const inv = inventario();
    await inv.reconstruirVarios([
      { productoId: 'a', cantidad: 5 },
      { productoId: 'b', cantidad: 2 },
    ]);
    const r = await inv.reservar(
      [
        { productoId: 'a', cantidad: 2 },
        { productoId: 'b', cantidad: 1 },
      ],
      Date.now() + 10 * MINUTO,
      'res-1',
    );
    expect(r.ok).toBe(true);
    expect(await inv.consultarVarios(['a', 'b'])).toEqual({ a: 3, b: 1 });
    expect(await inv.liberar('res-1')).toBe(true);
    expect(await inv.consultarVarios(['a', 'b'])).toEqual({ a: 5, b: 2 });
    expect(await inv.liberar('res-1')).toBe(false);
    expect(await inv.consultar('a')).toBe(5);
  });

  it('reconciliar: corrige un valor desviado y respeta las reservas vigentes', async () => {
    const inv = inventario();
    await inv.reconstruir('a', 10);
    await inv.reservar([{ productoId: 'a', cantidad: 2 }], Date.now() + 10 * MINUTO, 'r1');
    // Desvío: el objeto dice 8, pero el físico es 7 → objetivo 7 − 2 = 5.
    const r = await inv.reconciliar([
      { productoId: 'a', fisico: 7 },
      { productoId: 'nuevo', fisico: 4 },
    ]);
    expect(r.corregidos.sort()).toEqual(['a', 'nuevo']);
    expect(await inv.consultarVarios(['a', 'nuevo'])).toEqual({ a: 5, nuevo: 4 });
    // Sin desvío: no corrige nada.
    expect((await inv.reconciliar([{ productoId: 'a', fisico: 7 }])).corregidos).toEqual([]);
  });

  it('reconciliar: expira primero las vencidas (no las cuenta como reservadas)', async () => {
    const inv = inventario();
    const ahora = Date.now();
    await inv.reconstruir('a', 5);
    await inv.reservar([{ productoId: 'a', cantidad: 3 }], ahora + 1_000, 'vieja', ahora);
    await inv.reconciliar([{ productoId: 'a', fisico: 5 }], ahora + 2_000);
    expect(await inv.consultar('a')).toBe(5);
  });

  it('ajustar: suma la diferencia si existe, nunca baja de 0, y no inicializa', async () => {
    const inv = inventario();
    await inv.reconstruir('a', 5);
    expect(await inv.ajustar('a', 3)).toBe(8);
    expect(await inv.ajustar('a', -20)).toBe(0);
    expect(await inv.ajustar('sin-inicializar', 4)).toBeNull();
  });
});

describe('Inventario: pérdida del almacén (Sprint 6, D5 y D6)', () => {
  const pg = (reservaId: string, productoId: string, cantidad = 1) => ({
    reservaId,
    productoId,
    cantidad,
  });

  it('con el almacén vacío, descuenta las reservas activas que solo están en Postgres', async () => {
    const inv = inventario();
    const r = await inv.reconciliar([{ productoId: 'a', fisico: 5 }], Date.now(), [
      pg('r1', 'a'),
      pg('r2', 'a'),
    ]);
    expect(r.corregidos).toEqual(['a']);
    expect(await inv.consultar('a')).toBe(3);
  });

  it('una reserva presente en el objeto y en Postgres se cuenta una sola vez', async () => {
    const inv = inventario();
    await inv.reconstruir('a', 5);
    const res = await inv.reservar([{ productoId: 'a', cantidad: 1 }], Date.now() + 10 * MINUTO);
    if (!res.ok) throw new Error('debía reservar');
    await inv.reconciliar([{ productoId: 'a', fisico: 5 }], Date.now(), [pg(res.reservaId, 'a')]);
    expect(await inv.consultar('a')).toBe(4);
  });

  it('una reserva en vuelo, solo en el objeto, se sigue descontando', async () => {
    const inv = inventario();
    await inv.reconstruir('a', 5);
    await inv.reservar([{ productoId: 'a', cantidad: 2 }], Date.now() + 10 * MINUTO);
    await inv.reconciliar([{ productoId: 'a', fisico: 5 }], Date.now(), [pg('otra', 'a')]);
    expect(await inv.consultar('a')).toBe(2); // 5 − 2 (objeto) − 1 (Postgres)
  });

  it('sin reservas de Postgres se comporta como antes', async () => {
    const inv = inventario();
    await inv.reconstruir('a', 1);
    await inv.reservar([{ productoId: 'a', cantidad: 1 }], Date.now() + 10 * MINUTO);
    await inv.reconciliar([{ productoId: 'a', fisico: 4 }]);
    expect(await inv.consultar('a')).toBe(3);
  });

  it('vaciar borra todo, informa lo borrado y el objeto vuelve a reservar', async () => {
    const inv = inventario();
    await inv.reconstruir('a', 5);
    await inv.reconstruir('b', 2);
    await inv.reservar([{ productoId: 'a', cantidad: 1 }], Date.now() + 10 * MINUTO);
    expect(await inv.vaciar()).toEqual({ productos: 2, reservas: 1 });
    expect(await inv.consultar('a')).toBeNull();
    await inv.reconstruir('a', 3);
    const r = await inv.reservar([{ productoId: 'a', cantidad: 3 }], Date.now() + 10 * MINUTO);
    expect(r.ok).toBe(true);
    expect(await inv.consultar('a')).toBe(0);
  });
});

describe('Inventario: muchos productos (límite de 100 parámetros de SQLite)', () => {
  it('consultarVarios con 250 productos lee todos, en tandas', async () => {
    const inv = inventario();
    const ids = Array.from({ length: 250 }, (_, i) => `p-${i}`);
    await inv.reconstruirVarios(
      ids.slice(0, 240).map((productoId) => ({ productoId, cantidad: 2 })),
    );
    const r = await inv.consultarVarios(ids);
    expect(Object.keys(r)).toHaveLength(250);
    expect(Object.values(r).filter((v) => v === 2)).toHaveLength(240);
    expect(r['p-245']).toBeNull();
  });
});
