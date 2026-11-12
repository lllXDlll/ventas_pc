import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { esUuid } from '../comun/uuid';
import { conPrisma } from '../datos/prisma';

const POR_PAGINA = 20;
const NO_EXISTE = { codigo: 'NO_ENCONTRADO', mensaje: 'La compra no existe.' };

/** Una orden solo existe cuando su pago se confirmó (design D5 del Sprint 4). */
const ESTADO_ORDEN = 'PAGADA';

export interface ResumenCompra {
  id: string;
  fecha: string;
  total: string;
  estado: typeof ESTADO_ORDEN;
  productos: number;
  comprobante: { id: string; numero: string } | null;
}

export interface DetalleCompra extends Omit<ResumenCompra, 'productos'> {
  items: {
    producto: { id: string; nombre: string; marca: string | null; categoria: string };
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
  }[];
}

export interface ConfiguracionHistorial {
  id: string;
  origen: string;
  presupuesto: string | null;
  uso: string | null;
  estado: string;
  creadaEn: string;
  componentes: { productoId: string; nombre: string; categoria: string; cantidad: number }[];
}

export interface Pagina<T> {
  elementos: T[];
  total: number;
  pagina: number;
}

function numeroDePagina(texto: string | undefined): number {
  const pagina = texto === undefined ? 1 : Number(texto);
  if (!Number.isInteger(pagina) || pagina < 1) {
    throw new BadRequestException({
      codigo: 'SOLICITUD_INVALIDA',
      mensaje: 'pagina debe ser un entero positivo.',
    });
  }
  return pagina;
}

/** Historial de compras y configuraciones del usuario (spec historial). Solo lo propio. */
@Injectable()
export class HistorialService {
  async compras(usuarioId: string, paginaTexto?: string): Promise<Pagina<ResumenCompra>> {
    const pagina = numeroDePagina(paginaTexto);
    const [filas, total] = await conPrisma(async (p) => [
      await p.orden.findMany({
        where: { usuarioId },
        orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          creadaEn: true,
          total: true,
          comprobante: { select: { id: true, numero: true } },
          items: { select: { cantidad: true } },
        },
      }),
      await p.orden.count({ where: { usuarioId } }),
    ]);
    return {
      elementos: filas.map((o) => ({
        id: o.id,
        fecha: o.creadaEn.toISOString(),
        total: o.total.toFixed(2),
        estado: ESTADO_ORDEN,
        productos: o.items.reduce((s, i) => s + i.cantidad, 0),
        comprobante: o.comprobante,
      })),
      total,
      pagina,
    };
  }

  async compra(usuarioId: string, id: string): Promise<DetalleCompra> {
    if (!esUuid(id)) throw new NotFoundException(NO_EXISTE);
    const o = await conPrisma((p) =>
      p.orden.findFirst({
        where: { id, usuarioId },
        select: {
          id: true,
          creadaEn: true,
          total: true,
          comprobante: { select: { id: true, numero: true } },
          items: {
            orderBy: { id: 'asc' },
            select: {
              cantidad: true,
              precioUnitario: true,
              producto: {
                select: {
                  id: true,
                  nombre: true,
                  marca: true,
                  categoria: { select: { codigo: true } },
                },
              },
            },
          },
        },
      }),
    );
    // Ajena o inexistente: 404 igual, sin revelar que existe.
    if (!o) throw new NotFoundException(NO_EXISTE);
    return {
      id: o.id,
      fecha: o.creadaEn.toISOString(),
      total: o.total.toFixed(2),
      estado: ESTADO_ORDEN,
      comprobante: o.comprobante,
      items: o.items.map((i) => ({
        producto: {
          id: i.producto.id,
          nombre: i.producto.nombre,
          marca: i.producto.marca,
          categoria: i.producto.categoria.codigo,
        },
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario.toFixed(2),
        subtotal: i.precioUnitario.times(i.cantidad).toFixed(2),
      })),
    };
  }

  /** Estado guardado, sin recalcular: la lista cuesta una sola consulta (design D5). */
  async configuraciones(
    usuarioId: string,
    paginaTexto?: string,
  ): Promise<Pagina<ConfiguracionHistorial>> {
    const pagina = numeroDePagina(paginaTexto);
    const [filas, total] = await conPrisma(async (p) => [
      await p.configuracion.findMany({
        where: { usuarioId },
        orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          origen: true,
          presupuesto: true,
          uso: true,
          estado: true,
          creadaEn: true,
          items: {
            orderBy: { id: 'asc' },
            select: {
              cantidad: true,
              producto: {
                select: { id: true, nombre: true, categoria: { select: { codigo: true } } },
              },
            },
          },
        },
      }),
      await p.configuracion.count({ where: { usuarioId } }),
    ]);
    return {
      elementos: filas.map((c) => ({
        id: c.id,
        origen: c.origen,
        presupuesto: c.presupuesto?.toFixed(2) ?? null,
        uso: c.uso,
        estado: c.estado,
        creadaEn: c.creadaEn.toISOString(),
        componentes: c.items.map((i) => ({
          productoId: i.producto.id,
          nombre: i.producto.nombre,
          categoria: i.producto.categoria.codigo,
          cantidad: i.cantidad,
        })),
      })),
      total,
      pagina,
    };
  }
}
