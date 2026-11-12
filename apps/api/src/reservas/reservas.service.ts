import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { CarritoService } from '../carrito/carrito.service';
import { conPrisma } from '../datos/prisma';
import { Prisma } from '../generated/prisma/client';
import { DisponibleService } from './disponible.service';

const MINUTO_MS = 60_000;

/** TTL de las reservas (design D8): RESERVA_TTL_MIN, con decimales para pruebas. */
export function ttlReservaMs(valor = env.RESERVA_TTL_MIN): number {
  const min = Number(valor ?? '10');
  if (!Number.isFinite(min) || min <= 0 || min > 60) {
    throw new Error('RESERVA_TTL_MIN debe ser un número mayor que 0 y a lo sumo 60');
  }
  return Math.round(min * MINUTO_MS);
}

export interface VistaReserva {
  id: string;
  estado: string;
  venceEn: string;
  creadaEn: string;
  items: { producto: { id: string; nombre: string; precio: string }; cantidad: number }[];
  total: string;
}

const NO_EXISTE = { codigo: 'NO_ENCONTRADO', mensaje: 'No tienes una reserva activa con ese id.' };

const seleccion = {
  id: true,
  estado: true,
  venceEn: true,
  creadaEn: true,
  items: {
    orderBy: { productoId: 'asc' },
    select: {
      cantidad: true,
      producto: { select: { id: true, nombre: true, precio: true } },
    },
  },
} satisfies Prisma.ReservaSelect;

function vista(r: Prisma.ReservaGetPayload<{ select: typeof seleccion }>): VistaReserva {
  return {
    id: r.id,
    estado: r.estado,
    venceEn: r.venceEn.toISOString(),
    creadaEn: r.creadaEn.toISOString(),
    items: r.items.map((i) => ({
      producto: {
        id: i.producto.id,
        nombre: i.producto.nombre,
        precio: i.producto.precio.toFixed(2),
      },
      cantidad: i.cantidad,
    })),
    total: r.items
      .reduce((s, i) => s.plus(i.producto.precio.times(i.cantidad)), new Prisma.Decimal(0))
      .toFixed(2),
  };
}

/** Marca EXPIRADA en Postgres lo que ya venció (red de seguridad, design D3 y D4). */
function expirarVencidasEnPostgres(ids: string[] = []): Promise<number> {
  return conPrisma(async (p) => {
    const porId = ids.length
      ? (
          await p.reserva.updateMany({
            where: { id: { in: ids }, estado: 'ACTIVA' },
            data: { estado: 'EXPIRADA' },
          })
        ).count
      : 0;
    const porVencimiento = (
      await p.reserva.updateMany({
        where: { estado: 'ACTIVA', venceEn: { lt: new Date() } },
        data: { estado: 'EXPIRADA' },
      })
    ).count;
    return porId + porVencimiento;
  });
}

/** Reservas del carrito (spec reservas, design D3 y D4 del Sprint 3). */
@Injectable()
export class ReservasService {
  constructor(
    private readonly carrito: CarritoService,
    private readonly disponible: DisponibleService,
  ) {}

  async reservar(usuarioId: string): Promise<VistaReserva> {
    const items = await this.carrito.productos(usuarioId);
    if (items.length === 0) {
      throw new BadRequestException({ codigo: 'CARRITO_VACIO', mensaje: 'Tu carrito está vacío.' });
    }
    await expirarVencidasEnPostgres();

    // Una reserva activa por cliente: la anterior se libera antes.
    const anterior = await conPrisma((p) =>
      p.reserva.findFirst({ where: { usuarioId, estado: 'ACTIVA' }, select: { id: true } }),
    );
    if (anterior) await this.liberarYExpirar(anterior.id);

    const id = randomUUID();
    const venceEn = Date.now() + ttlReservaMs();
    const r = await this.disponible.reservar(items, venceEn, id);
    if (!r.ok) {
      if (r.motivo === 'INSUFICIENTE') {
        const producto = await conPrisma((p) =>
          p.producto.findFirst({ where: { id: r.productoId }, select: { nombre: true } }),
        );
        throw new ConflictException({
          codigo: 'SIN_STOCK',
          mensaje: `No hay stock suficiente de «${producto?.nombre ?? r.productoId}»: quedan ${r.disponible}.`,
          detalle: {
            productoId: r.productoId,
            nombre: producto?.nombre ?? null,
            disponible: r.disponible,
          },
        });
      }
      if (r.motivo === 'INVALIDA') {
        throw new BadRequestException({ codigo: 'SOLICITUD_INVALIDA', mensaje: r.mensaje });
      }
      throw new ServiceUnavailableException({
        codigo: 'NO_DISPONIBLE',
        mensaje: 'No se pudo inicializar el stock. Intenta de nuevo.',
      });
    }

    try {
      const creada = await conPrisma((p) =>
        p.reserva.create({
          data: {
            id,
            usuarioId,
            estado: 'ACTIVA',
            venceEn: new Date(venceEn),
            items: {
              create: items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
            },
          },
          select: seleccion,
        }),
      );
      return vista(creada);
    } catch (error) {
      // Compensación: sin registro en Postgres no queda stock tomado en el almacén.
      await this.disponible.liberar(id).catch(() => undefined);
      throw error;
    }
  }

  async activa(usuarioId: string): Promise<VistaReserva> {
    const r = await conPrisma((p) =>
      p.reserva.findFirst({
        where: { usuarioId, estado: 'ACTIVA', venceEn: { gt: new Date() } },
        select: seleccion,
      }),
    );
    if (!r)
      throw new NotFoundException({
        codigo: 'NO_ENCONTRADO',
        mensaje: 'No tienes una reserva activa.',
      });
    return vista(r);
  }

  async cancelar(usuarioId: string, id: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException(NO_EXISTE);
    const r = await conPrisma((p) =>
      p.reserva.findFirst({ where: { id, usuarioId, estado: 'ACTIVA' }, select: { id: true } }),
    );
    if (!r) throw new NotFoundException(NO_EXISTE);
    await this.liberarYExpirar(id);
  }

  private async liberarYExpirar(id: string): Promise<void> {
    await this.disponible.liberar(id);
    await conPrisma((p) =>
      p.reserva.updateMany({ where: { id, estado: 'ACTIVA' }, data: { estado: 'EXPIRADA' } }),
    );
  }

  /** Cron de cada minuto (design D4): expira en el almacén y sincroniza Postgres. */
  async expirar(): Promise<number> {
    const ids = await this.disponible.expirar();
    return expirarVencidasEnPostgres(ids);
  }
}
