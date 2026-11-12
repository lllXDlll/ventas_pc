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

/** Ítem de una reserva ACTIVA vigente según Postgres (reconciliación, Sprint 6 D5). */
export interface ItemReservaPostgres {
  reservaId: string;
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

/** Límite de parámetros enlazados por consulta en el SQLite de los Durable Objects. */
const MAX_PARAMETROS_SQL = 100;

export class Inventario extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.crearEsquema();
  }

  private crearEsquema(): void {
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
    const disponibles = this.leerDisponibles(ids);

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

  // ── Sprint 3 (design D1) ──────────────────────────────────────────────────────────

  /** Disponible de varios productos en una llamada; null si no está inicializado. */
  async consultarVarios(productoIds: string[]): Promise<Record<string, number | null>> {
    const resultado: Record<string, number | null> = Object.fromEntries(
      productoIds.map((id) => [id, null]),
    );
    for (const [id, cantidad] of this.leerDisponibles(productoIds)) resultado[id] = cantidad;
    return resultado;
  }

  /**
   * Disponible de varios productos, en tandas: el SQLite de los Durable Objects admite como
   * máximo 100 parámetros por consulta (el asistente consulta todo el catálogo activo).
   * Síncrono, para que reservar siga sin `await` entre la verificación y la escritura.
   */
  private leerDisponibles(productoIds: readonly string[]): Map<string, number> {
    const vigentes = new Map<string, number>();
    for (let i = 0; i < productoIds.length; i += MAX_PARAMETROS_SQL) {
      const tanda = productoIds.slice(i, i + MAX_PARAMETROS_SQL);
      for (const fila of this.sql
        .exec<{ producto_id: string; cantidad: number }>(
          `SELECT producto_id, cantidad FROM disponible WHERE producto_id IN (${tanda.map(() => '?').join(',')})`,
          ...tanda,
        )
        .toArray()) {
        vigentes.set(fila.producto_id, fila.cantidad);
      }
    }
    return vigentes;
  }

  /**
   * Reconstrucción perezosa en lote: inserta solo los que no existen (nunca sobrescribe)
   * y devuelve el valor vigente de cada uno.
   */
  async reconstruirVarios(items: ItemReserva[]): Promise<Record<string, number>> {
    for (const { cantidad } of items) validarCantidad(cantidad, true);
    this.ctx.storage.transactionSync(() => {
      for (const { productoId, cantidad } of items) {
        this.sql.exec(
          'INSERT INTO disponible (producto_id, cantidad) VALUES (?, ?) ON CONFLICT (producto_id) DO NOTHING',
          productoId,
          cantidad,
        );
      }
    });
    const vigentes = await this.consultarVarios(items.map((i) => i.productoId));
    return Object.fromEntries(Object.entries(vigentes).map(([id, v]) => [id, v ?? 0]));
  }

  /**
   * Lo inverso de reservar: devuelve las cantidades al disponible y borra la reserva.
   * Para cancelar, reemplazar la reserva de un cliente o compensar un fallo de Postgres.
   * Devuelve false si la reserva ya no existía (expirada o cerrada).
   */
  async liberar(reservaId: string): Promise<boolean> {
    let existia = false;
    this.ctx.storage.transactionSync(() => {
      existia =
        this.sql.exec<{ id: string }>('SELECT id FROM reservas WHERE id = ?', reservaId).toArray()
          .length > 0;
      if (!existia) return;
      this.devolverYBorrar(reservaId);
    });
    return existia;
  }

  /**
   * Reconciliación (design D1 del Sprint 3 y D5 del Sprint 6): objetivo = físico − reservas
   * activas, contando la unión por id de las del propio objeto (incluye las que están en
   * vuelo, aún no registradas en Postgres) y las ACTIVA vigentes de Postgres que el objeto no
   * conoce (las que perdió si se borró su almacenamiento). Escribe solo si difiere.
   */
  async reconciliar(
    fisicos: { productoId: string; fisico: number }[],
    ahora: number = Date.now(),
    reservasPostgres: ItemReservaPostgres[] = [],
  ): Promise<{ corregidos: string[] }> {
    this.expirarSincrono(ahora);
    const corregidos: string[] = [];
    this.ctx.storage.transactionSync(() => {
      const conocidas = new Set(
        this.sql
          .exec<{ id: string }>('SELECT id FROM reservas')
          .toArray()
          .map((f) => f.id),
      );
      const desconocidas = new Map<string, number>();
      for (const { reservaId, productoId, cantidad } of reservasPostgres) {
        if (conocidas.has(reservaId)) continue;
        desconocidas.set(productoId, (desconocidas.get(productoId) ?? 0) + cantidad);
      }
      for (const { productoId, fisico } of fisicos) {
        const reservado =
          (this.sql
            .exec<{ total: number | null }>(
              'SELECT SUM(cantidad) AS total FROM reserva_items WHERE producto_id = ?',
              productoId,
            )
            .toArray()[0]?.total ?? 0) + (desconocidas.get(productoId) ?? 0);
        const objetivo = Math.max(0, fisico - reservado);
        const actual = this.sql
          .exec<{ cantidad: number }>(
            'SELECT cantidad FROM disponible WHERE producto_id = ?',
            productoId,
          )
          .toArray()[0]?.cantidad;
        if (actual === objetivo) continue;
        this.sql.exec(
          `INSERT INTO disponible (producto_id, cantidad) VALUES (?, ?)
           ON CONFLICT (producto_id) DO UPDATE SET cantidad = excluded.cantidad`,
          productoId,
          objetivo,
        );
        corregidos.push(productoId);
      }
    });
    return { corregidos };
  }

  /**
   * Borra todo el almacenamiento y recrea el esquema vacío (escenario de pérdida del
   * almacén, Sprint 6 D6). Solo lo llama el módulo de pruebas, que no existe en producción.
   */
  async vaciar(): Promise<{ productos: number; reservas: number }> {
    const contar = (tabla: string) =>
      this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tabla}`).toArray()[0]?.n ?? 0;
    const borrados = { productos: contar('disponible'), reservas: contar('reservas') };
    await this.ctx.storage.deleteAll();
    this.crearEsquema();
    return borrados;
  }

  /** Cambio de stock físico desde el panel: suma la diferencia si el producto existe. */
  async ajustar(productoId: string, delta: number): Promise<number | null> {
    if (!Number.isInteger(delta)) throw new RangeError(`delta inválido: ${delta}`);
    this.sql.exec(
      'UPDATE disponible SET cantidad = MAX(0, cantidad + ?) WHERE producto_id = ?',
      delta,
      productoId,
    );
    return this.consultar(productoId);
  }

  /** Devuelve los ítems de una reserva al disponible y la borra (sin transacción propia). */
  private devolverYBorrar(id: string): number {
    let filas = this.sql.exec(
      `UPDATE disponible SET cantidad = cantidad + (
         SELECT ri.cantidad FROM reserva_items ri
         WHERE ri.reserva_id = ? AND ri.producto_id = disponible.producto_id)
       WHERE producto_id IN (SELECT producto_id FROM reserva_items WHERE reserva_id = ?)`,
      id,
      id,
    ).rowsWritten;
    filas += this.sql.exec('DELETE FROM reserva_items WHERE reserva_id = ?', id).rowsWritten;
    filas += this.sql.exec('DELETE FROM reservas WHERE id = ?', id).rowsWritten;
    return filas;
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
