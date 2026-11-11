import { DurableObject } from 'cloudflare:workers';

/**
 * Almacén de disponibilidad, opción B (parte técnica 5.2, design.md D5).
 *
 * Un único objeto para todo el catálogo. Un Durable Object atiende sus
 * peticiones de una en una, y cada método hace todo su trabajo de forma síncrona
 * (sin `await` entre la verificación y la escritura), así que la reserva de
 * varios productos es atómica: se descuenta todo o nada.
 *
 * "disponible" = stock físico − reservas activas. Postgres sigue siendo la verdad;
 * este objeto es la vía rápida y se puede reconstruir desde Postgres.
 *
 * Sprint 0: prototipo para la prueba 4 de HU-36b. Base del Sprint 3.
 */

export interface ItemReserva {
  productoId: string;
  cantidad: number;
}

export type ResultadoReserva =
  | { ok: true; reservaId: string; filasEscritas: number }
  | { ok: false; motivo: 'INSUFICIENTE'; productoId: string; disponible: number }
  | { ok: false; motivo: 'NO_INICIALIZADO'; productoIds: string[] }
  | { ok: false; motivo: 'INVALIDA'; mensaje: string };

export interface ResultadoExpiracion {
  expiradas: string[];
  filasEscritas: number;
}

export class Inventario extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // WITHOUT ROWID: la clave primaria es la propia tabla, sin índice aparte.
    // Cada índice cuenta como una fila escrita más en la cuota diaria del plan gratuito.
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS disponible (
        producto_id TEXT PRIMARY KEY,
        cantidad    INTEGER NOT NULL CHECK (cantidad >= 0)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS reservas (
        id       TEXT PRIMARY KEY,
        vence_en INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS reservas_vence_en ON reservas (vence_en);
      CREATE TABLE IF NOT EXISTS reserva_items (
        reserva_id  TEXT NOT NULL REFERENCES reservas (id),
        producto_id TEXT NOT NULL,
        cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
        PRIMARY KEY (reserva_id, producto_id)
      ) WITHOUT ROWID;
    `);
  }

  async ping(): Promise<'ok'> {
    return 'ok';
  }

  /** Disponible de un producto, o null si no está inicializado (nunca se asume 0). */
  async consultar(productoId: string): Promise<number | null> {
    const fila = this.sql
      .exec<{ cantidad: number }>(
        'SELECT cantidad FROM disponible WHERE producto_id = ?',
        productoId,
      )
      .toArray()[0];
    return fila ? fila.cantidad : null;
  }

  /**
   * Reconstrucción perezosa: fija el disponible de un producto solo si no existe.
   * Nunca sobrescribe un valor existente. Devuelve true si lo insertó.
   */
  async reconstruir(productoId: string, cantidad: number): Promise<boolean> {
    validarCantidad(cantidad, true);
    const cursor = this.sql.exec(
      'INSERT INTO disponible (producto_id, cantidad) VALUES (?, ?) ON CONFLICT (producto_id) DO NOTHING',
      productoId,
      cantidad,
    );
    return cursor.rowsWritten > 0;
  }

  /** Expira las reservas vencidas y devuelve sus cantidades al disponible. */
  async expirar(ahora: number = Date.now()): Promise<ResultadoExpiracion> {
    return this.expirarSincrono(ahora);
  }

  /**
   * Reserva todo o nada. Expira primero las reservas vencidas. Si algún producto
   * no está inicializado o no alcanza, no descuenta nada.
   */
  async reservar(
    items: ItemReserva[],
    venceEn: number,
    reservaId: string = crypto.randomUUID(),
    ahora: number = Date.now(),
  ): Promise<ResultadoReserva> {
    let pedido: Map<string, number>;
    try {
      pedido = normalizar(items);
      if (!(venceEn > ahora)) throw new RangeError('el vencimiento debe ser posterior a ahora');
    } catch (error) {
      return { ok: false, motivo: 'INVALIDA', mensaje: (error as Error).message };
    }

    const { filasEscritas: filasExpiracion } = this.expirarSincrono(ahora);

    const ids = [...pedido.keys()];
    const disponibles = new Map(
      this.sql
        .exec<{ producto_id: string; cantidad: number }>(
          `SELECT producto_id, cantidad FROM disponible WHERE producto_id IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        )
        .toArray()
        .map((f) => [f.producto_id, f.cantidad]),
    );

    const faltantes = ids.filter((id) => !disponibles.has(id));
    if (faltantes.length > 0)
      return { ok: false, motivo: 'NO_INICIALIZADO', productoIds: faltantes };

    for (const [productoId, cantidad] of pedido) {
      const disponible = disponibles.get(productoId) ?? 0;
      if (disponible < cantidad)
        return { ok: false, motivo: 'INSUFICIENTE', productoId, disponible };
    }

    let filasEscritas = filasExpiracion;
    this.ctx.storage.transactionSync(() => {
      filasEscritas += this.sql.exec(
        'INSERT INTO reservas (id, vence_en) VALUES (?, ?)',
        reservaId,
        venceEn,
      ).rowsWritten;
      for (const [productoId, cantidad] of pedido) {
        filasEscritas += this.sql.exec(
          'UPDATE disponible SET cantidad = cantidad - ? WHERE producto_id = ?',
          cantidad,
          productoId,
        ).rowsWritten;
        filasEscritas += this.sql.exec(
          'INSERT INTO reserva_items (reserva_id, producto_id, cantidad) VALUES (?, ?, ?)',
          reservaId,
          productoId,
          cantidad,
        ).rowsWritten;
      }
    });
    return { ok: true, reservaId, filasEscritas };
  }

  /**
   * Cierra una reserva confirmada SIN devolver stock (la venta ya descontó el
   * stock físico en Postgres). Devuelve true si la reserva existía.
   */
  async cerrar(reservaId: string): Promise<boolean> {
    let existia = false;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM reserva_items WHERE reserva_id = ?', reservaId);
      existia = this.sql.exec('DELETE FROM reservas WHERE id = ?', reservaId).rowsWritten > 0;
    });
    return existia;
  }

  private expirarSincrono(ahora: number): ResultadoExpiracion {
    const vencidas = this.sql
      .exec<{ id: string }>('SELECT id FROM reservas WHERE vence_en <= ?', ahora)
      .toArray()
      .map((f) => f.id);
    if (vencidas.length === 0) return { expiradas: [], filasEscritas: 0 };

    let filasEscritas = 0;
    this.ctx.storage.transactionSync(() => {
      for (const id of vencidas) {
        filasEscritas += this.sql.exec(
          `UPDATE disponible SET cantidad = cantidad + (
             SELECT ri.cantidad FROM reserva_items ri
             WHERE ri.reserva_id = ? AND ri.producto_id = disponible.producto_id)
           WHERE producto_id IN (SELECT producto_id FROM reserva_items WHERE reserva_id = ?)`,
          id,
          id,
        ).rowsWritten;
        filasEscritas += this.sql.exec(
          'DELETE FROM reserva_items WHERE reserva_id = ?',
          id,
        ).rowsWritten;
        filasEscritas += this.sql.exec('DELETE FROM reservas WHERE id = ?', id).rowsWritten;
      }
    });
    return { expiradas: vencidas, filasEscritas };
  }
}

function validarCantidad(cantidad: number, permitirCero = false): void {
  if (!Number.isInteger(cantidad) || cantidad < (permitirCero ? 0 : 1)) {
    throw new RangeError(`cantidad inválida: ${cantidad}`);
  }
}

/** Valida los ítems y suma cantidades repetidas del mismo producto. */
function normalizar(items: ItemReserva[]): Map<string, number> {
  if (items.length === 0) throw new RangeError('la reserva no tiene ítems');
  const pedido = new Map<string, number>();
  for (const { productoId, cantidad } of items) {
    validarCantidad(cantidad);
    pedido.set(productoId, (pedido.get(productoId) ?? 0) + cantidad);
  }
  return pedido;
}
