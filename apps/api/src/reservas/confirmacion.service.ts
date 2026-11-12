import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { conPrisma, conTransaccion } from '../datos/prisma';
import { Prisma } from '../generated/prisma/client';
import { NotificacionesService, TIPO } from '../notificaciones/notificaciones.service';
import { DisponibleService } from './disponible.service';

/** Margen antes del vencimiento (design D4): no se confirma lo que está por expirar. */
export const MARGEN_CONFIRMACION_MS = 30_000;
const REINTENTOS_VERSION = 3;

export interface OrdenConfirmada {
  id: string;
  reservaId: string;
  total: string;
  comprobante: string;
  comprobanteId: string;
  items: { productoId: string; cantidad: number; precioUnitario: string }[];
  creadaEn: string;
}

const seleccionOrden = {
  id: true,
  reservaId: true,
  usuarioId: true,
  total: true,
  creadaEn: true,
  comprobante: { select: { id: true, numero: true } },
  items: {
    orderBy: { productoId: 'asc' },
    select: { productoId: true, cantidad: true, precioUnitario: true },
  },
} satisfies Prisma.OrdenSelect;

type FilaOrden = Prisma.OrdenGetPayload<{ select: typeof seleccionOrden }>;

function aVista(o: FilaOrden): OrdenConfirmada {
  return {
    id: o.id,
    reservaId: o.reservaId,
    total: o.total.toFixed(2),
    comprobante: o.comprobante?.numero ?? '',
    comprobanteId: o.comprobante?.id ?? '',
    items: o.items.map((i) => ({
      productoId: i.productoId,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario.toFixed(2),
    })),
    creadaEn: o.creadaEn.toISOString(),
  };
}

class ErrorNegocio extends Error {
  constructor(readonly excepcion: Error) {
    super(excepcion.message);
  }
}

/** La reserva ya estaba confirmada (otra llamada con la misma clave ganó el bloqueo). */
class YaConfirmada extends Error {}

const esUnicidad = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Datos del pago que quedan en el comprobante: solo los 4 últimos dígitos (spec pagos). */
export interface DatosPago {
  ultimos4?: string;
}

/**
 * Confirmación de una reserva (spec reservas, design D5 del Sprint 3). La invoca
 * `POST /pagos/confirmar` con el Idempotency-Key del cliente (Sprint 4).
 */
@Injectable()
export class ConfirmacionService {
  constructor(
    private readonly disponible: DisponibleService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private async porClave(clave: string): Promise<FilaOrden | null> {
    return conPrisma((p) =>
      p.orden.findFirst({ where: { claveIdempotencia: clave }, select: seleccionOrden }),
    );
  }

  /** Reintento con la misma clave: la orden original, si es de la misma reserva y usuario. */
  private original(o: FilaOrden, usuarioId: string, reservaId: string): OrdenConfirmada {
    if (o.reservaId !== reservaId || o.usuarioId !== usuarioId) {
      throw new ConflictException({
        codigo: 'CLAVE_EN_USO',
        mensaje: 'La clave de idempotencia ya se usó para otra compra.',
      });
    }
    return aVista(o);
  }

  /** La orden que ya produjo esta clave, si existe (el pago no se vuelve a autorizar). */
  async existeClave(clave: string): Promise<boolean> {
    return (await this.porClave(clave)) !== null;
  }

  async confirmar(
    usuarioId: string,
    reservaId: string,
    clave: string,
    pago: DatosPago = {},
  ): Promise<OrdenConfirmada> {
    if (typeof clave !== 'string' || clave.length < 8 || clave.length > 100) {
      throw new BadRequestException({
        codigo: 'SOLICITUD_INVALIDA',
        mensaje: 'Falta la clave de idempotencia (Idempotency-Key, de 8 a 100 caracteres).',
      });
    }
    const previa = await this.porClave(clave);
    if (previa) return this.original(previa, usuarioId, reservaId);

    let orden: FilaOrden;
    try {
      orden = await conTransaccion(async (tx) => {
        const [reserva] = await tx.$queryRaw<{ estado: string; vence_en: Date }[]>`
            SELECT estado::text AS estado, vence_en FROM reservas
             WHERE id = ${reservaId}::uuid AND usuario_id = ${usuarioId}::uuid
             FOR UPDATE`;
        if (reserva?.estado === 'CONFIRMADA') throw new YaConfirmada();
        if (
          !reserva ||
          reserva.estado !== 'ACTIVA' ||
          reserva.vence_en.getTime() <= Date.now() + MARGEN_CONFIRMACION_MS
        ) {
          throw new ErrorNegocio(
            new ConflictException({
              codigo: 'RESERVA_EXPIRADA',
              mensaje: 'Tu reserva expiró. Vuelve a iniciar la compra.',
            }),
          );
        }
        const items = await tx.reservaItem.findMany({
          where: { reservaId },
          orderBy: { productoId: 'asc' }, // orden fijo: sin interbloqueos entre confirmaciones
          select: {
            productoId: true,
            cantidad: true,
            producto: { select: { precio: true, nombre: true } },
          },
        });
        for (const item of items) {
          await descontar(tx, item.productoId, item.cantidad);
        }
        const total = items.reduce(
          (s, i) => s.plus(i.producto.precio.times(i.cantidad)),
          new Prisma.Decimal(0),
        );
        const creada = await tx.orden.create({
          data: {
            usuarioId,
            reservaId,
            claveIdempotencia: clave,
            total,
            items: {
              create: items.map((i) => ({
                productoId: i.productoId,
                cantidad: i.cantidad,
                precioUnitario: i.producto.precio,
              })),
            },
          },
          select: { id: true, creadaEn: true },
        });
        // El número se toma después de crear la orden (un P2002 de la clave aborta antes)
        // y lo más tarde posible, para no dejar huecos en la secuencia (design D3).
        const numero = await siguienteNumero(tx);
        await tx.comprobante.create({
          data: {
            ordenId: creada.id,
            numero,
            detalle: {
              items: items.map((i) => ({
                productoId: i.productoId,
                nombre: i.producto.nombre,
                cantidad: i.cantidad,
                precioUnitario: i.producto.precio.toFixed(2),
                subtotal: i.producto.precio.times(i.cantidad).toFixed(2),
              })),
              total: total.toFixed(2),
              ...(pago.ultimos4 ? { tarjeta: { ultimos4: pago.ultimos4 } } : {}),
            },
          },
        });
        // En la misma transacción: no hay orden sin aviso (spec notificaciones).
        await this.notificaciones.crear(
          tx,
          usuarioId,
          TIPO.COMPRA_CONFIRMADA,
          `Tu compra se confirmó. Comprobante ${numero}.`,
        );
        await tx.reserva.update({ where: { id: reservaId }, data: { estado: 'CONFIRMADA' } });
        // Lo comprado sale del carrito (spec pagos): la próxima compra empieza vacía.
        await tx.carritoItem.deleteMany({ where: { carrito: { usuarioId } } });
        return tx.orden.findFirstOrThrow({ where: { id: creada.id }, select: seleccionOrden });
      });
    } catch (error) {
      if (error instanceof ErrorNegocio) throw error.excepcion;
      // Otra confirmación simultánea con la misma clave ganó: se devuelve su orden.
      if (esUnicidad(error) || error instanceof YaConfirmada) {
        const ganadora = await this.porClave(clave);
        if (ganadora) return this.original(ganadora, usuarioId, reservaId);
        throw new ConflictException({
          codigo: 'CONFLICTO',
          mensaje: 'La reserva ya se confirmó con otra clave.',
        });
      }
      throw error;
    }

    // Tras el commit: cierre en el almacén SIN devolver stock (ya se vendió).
    await this.disponible.cerrar(reservaId).catch((e: unknown) =>
      console.error(
        JSON.stringify({
          nivel: 'error',
          mensaje: 'no se cerró la reserva',
          reservaId,
          error: String(e),
        }),
      ),
    );
    return aVista(orden);
  }
}

/** UPDATE condicional por versión (spec reservas): reintenta si la versión cambió. */
async function descontar(tx: Prisma.TransactionClient, productoId: string, n: number) {
  for (let intento = 0; intento < REINTENTOS_VERSION; intento++) {
    const stock = await tx.stock.findFirst({
      where: { productoId },
      select: { cantidad: true, version: true },
    });
    if (!stock || stock.cantidad < n) {
      throw new ErrorNegocio(
        new ConflictException({
          codigo: 'SIN_STOCK',
          mensaje: 'No hay stock suficiente para confirmar.',
        }),
      );
    }
    const filas = await tx.$executeRaw`
      UPDATE stock SET cantidad = cantidad - ${n}, version = version + 1
       WHERE producto_id = ${productoId}::uuid AND cantidad >= ${n} AND version = ${stock.version}`;
    if (filas === 1) return;
  }
  throw new ErrorNegocio(
    new ConflictException({
      codigo: 'CONFLICTO',
      mensaje: 'El stock cambió demasiadas veces; reintenta.',
    }),
  );
}

/** XD-000001, XD-000002… desde la secuencia de Postgres (spec comprobantes). */
async function siguienteNumero(tx: Prisma.TransactionClient): Promise<string> {
  const [fila] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('comprobante_numero_seq') AS n`;
  return `XD-${String(fila!.n).padStart(6, '0')}`;
}
