import { Injectable, NotFoundException } from '@nestjs/common';
import { esUuid } from '../comun/uuid';
import { conPrisma } from '../datos/prisma';

export interface VistaComprobante {
  id: string;
  numero: string;
  fecha: string;
  ordenId: string;
  cliente: string;
  items: {
    productoId: string;
    nombre: string;
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
  }[];
  total: string;
  tarjeta: { ultimos4: string } | null;
}

interface DetalleGuardado {
  items?: {
    productoId: string;
    nombre?: string;
    cantidad: number;
    precioUnitario: string;
    subtotal?: string;
  }[];
  total?: string;
  tarjeta?: { ultimos4: string };
}

const NO_EXISTE = { codigo: 'NO_ENCONTRADO', mensaje: 'El comprobante no existe.' };

/** Comprobantes de compra (spec comprobantes). */
@Injectable()
export class ComprobantesService {
  /** Solo el dueño de la orden; ajeno o inexistente: 404 igual. */
  async ver(usuarioId: string, id: string): Promise<VistaComprobante> {
    if (!esUuid(id)) throw new NotFoundException(NO_EXISTE);
    const fila = await conPrisma((p) =>
      p.comprobante.findFirst({
        where: { id, orden: { usuarioId } },
        select: {
          id: true,
          numero: true,
          fecha: true,
          detalle: true,
          orden: {
            select: {
              id: true,
              total: true,
              usuario: { select: { correo: true } },
              // Respaldo para los comprobantes del Sprint 3, que no copiaban el nombre.
              items: { select: { productoId: true, producto: { select: { nombre: true } } } },
            },
          },
        },
      }),
    );
    if (!fila) throw new NotFoundException(NO_EXISTE);
    const detalle = (fila.detalle ?? {}) as DetalleGuardado;
    const nombres = new Map(fila.orden.items.map((i) => [i.productoId, i.producto.nombre]));
    return {
      id: fila.id,
      numero: fila.numero,
      fecha: fila.fecha.toISOString(),
      ordenId: fila.orden.id,
      cliente: fila.orden.usuario.correo,
      items: (detalle.items ?? []).map((i) => ({
        productoId: i.productoId,
        nombre: i.nombre ?? nombres.get(i.productoId) ?? 'Producto',
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        subtotal: i.subtotal ?? (Number(i.precioUnitario) * i.cantidad).toFixed(2),
      })),
      total: detalle.total ?? fila.orden.total.toFixed(2),
      tarjeta: detalle.tarjeta ?? null,
    };
  }
}
