import type { Inventario, ItemReserva, ResultadoReserva } from './inventario';

/** Producto con su stock físico, tal como lo trae una consulta del catálogo. */
export interface ProductoConStock {
  productoId: string;
  stockFisico: number;
}

/**
 * Puerto único hacia el almacén de disponibilidad (parte técnica 5; design D1 y D2 del
 * Sprint 3). El resto del código depende de esta clase, no del Durable Object: cambiar de
 * almacén (opción A, Upstash) solo cambiaría su implementación.
 */
export abstract class DisponibleService {
  /** Resuelve si el almacén responde; lanza un error si no. */
  abstract ping(): Promise<void>;

  /** Disponible para vender de cada producto (reconstruye perezosamente los que falten). */
  abstract disponibles(productos: readonly ProductoConStock[]): Promise<Map<string, number>>;

  /** Reserva todo o nada; reconstruye y reintenta una vez si hay productos sin inicializar. */
  abstract reservar(
    items: ItemReserva[],
    venceEn: number,
    reservaId: string,
  ): Promise<ResultadoReserva>;

  /** Devuelve al disponible una reserva vigente; false si ya no existía. */
  abstract liberar(reservaId: string): Promise<boolean>;

  /** Expira las vencidas; devuelve sus ids. */
  abstract expirar(): Promise<string[]>;

  /** Cierra una reserva confirmada sin devolver stock. */
  abstract cerrar(reservaId: string): Promise<boolean>;

  /** Corrige el disponible con el stock físico; devuelve los productos corregidos. */
  abstract reconciliar(fisicos: { productoId: string; fisico: number }[]): Promise<string[]>;

  /** Suma una diferencia de stock físico al disponible, si el producto está inicializado. */
  abstract ajustar(productoId: string, delta: number): Promise<void>;
}

/** Nombre del único objeto Inventario para todo el catálogo (atomicidad multi-producto). */
export const NOMBRE_INVENTARIO = 'catalogo';

/** Consultas a Postgres que necesita la reconstrucción (inyectadas: pruebas sin base). */
export interface FuenteFisica {
  /** Σ reservas ACTIVA vigentes por producto. */
  reservadoActivo(productoIds: string[]): Promise<Map<string, number>>;
  /** Stock físico por producto. */
  stockFisico(productoIds: string[]): Promise<Map<string, number>>;
}

/** Implementación sobre el Durable Object Inventario (opción B, Sprint 0). */
export class DisponibleDurableObject extends DisponibleService {
  constructor(
    private readonly inventarios: DurableObjectNamespace<Inventario>,
    private readonly fuente: FuenteFisica,
  ) {
    super();
  }

  private stub() {
    return this.inventarios.get(this.inventarios.idFromName(NOMBRE_INVENTARIO));
  }

  async ping(): Promise<void> {
    const respuesta = await this.stub().ping();
    if (respuesta !== 'ok') throw new Error('respuesta inesperada del almacén');
  }

  /** Reconstrucción perezosa en lote (design D2): 1 consulta y 1 llamada al objeto. */
  private async reconstruir(
    productoIds: string[],
    fisicos?: Map<string, number>,
  ): Promise<Record<string, number>> {
    const [reservado, fisico] = await Promise.all([
      this.fuente.reservadoActivo(productoIds),
      fisicos ?? this.fuente.stockFisico(productoIds),
    ]);
    return this.stub().reconstruirVarios(
      productoIds.map((id) => ({
        productoId: id,
        cantidad: Math.max(0, (fisico.get(id) ?? 0) - (reservado.get(id) ?? 0)),
      })),
    );
  }

  async disponibles(productos: readonly ProductoConStock[]): Promise<Map<string, number>> {
    const ids = [...new Set(productos.map((p) => p.productoId))];
    if (ids.length === 0) return new Map();
    const valores = await this.stub().consultarVarios(ids);
    const faltan = ids.filter((id) => valores[id] === null || valores[id] === undefined);
    if (faltan.length > 0) {
      const fisicos = new Map(productos.map((p) => [p.productoId, p.stockFisico]));
      Object.assign(valores, await this.reconstruir(faltan, fisicos));
    }
    return new Map(ids.map((id) => [id, valores[id] ?? 0]));
  }

  async reservar(
    items: ItemReserva[],
    venceEn: number,
    reservaId: string,
  ): Promise<ResultadoReserva> {
    const r = await this.stub().reservar(items, venceEn, reservaId);
    if (r.ok || r.motivo !== 'NO_INICIALIZADO') return r;
    // Nunca se asume cero: se reconstruye desde Postgres y se reintenta una vez.
    await this.reconstruir(r.productoIds);
    return this.stub().reservar(items, venceEn, reservaId);
  }

  liberar(reservaId: string): Promise<boolean> {
    return this.stub().liberar(reservaId);
  }

  async expirar(): Promise<string[]> {
    return (await this.stub().expirar()).expiradas;
  }

  cerrar(reservaId: string): Promise<boolean> {
    return this.stub().cerrar(reservaId);
  }

  async reconciliar(fisicos: { productoId: string; fisico: number }[]): Promise<string[]> {
    if (fisicos.length === 0) return [];
    return (await this.stub().reconciliar(fisicos)).corregidos;
  }

  async ajustar(productoId: string, delta: number): Promise<void> {
    if (delta !== 0) await this.stub().ajustar(productoId, delta);
  }
}
