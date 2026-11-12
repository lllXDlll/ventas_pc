import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CompatibilidadService,
  type Evaluacion,
  type ProductoDeConfiguracion,
} from '../compatibilidad/compatibilidad.service';
import type { ItemDto } from '../compatibilidad/dto';
import type { Rechazo } from '../compatibilidad/motor/tipos';
import { conPrisma } from '../datos/prisma';
import { esUuid } from '../comun/uuid';
import { Prisma } from '../generated/prisma/client';

export interface Faltante {
  productoId: string;
  disponible: number;
  cantidad: number;
}

/** Vista de una configuración (spec configuraciones). */
export interface VistaConfiguracion {
  id: string;
  origen: string;
  estado: string;
  creadaEn: string;
  items: { producto: ProductoDeConfiguracion; cantidad: number }[];
  total: string;
  compatible: boolean;
  rechazos: Rechazo[];
  /** Sin rechazos, con al menos un producto y todos activos con disponible suficiente. */
  agregable: boolean;
  faltantes: Faltante[];
}

export interface ResumenConfiguracion {
  id: string;
  estado: string;
  creadaEn: string;
  productos: number;
  total: string;
}

const NO_EXISTE = { codigo: 'NO_ENCONTRADO', mensaje: 'La configuración no existe.' };
const POR_PAGINA = 20;

function vista(
  base: { id: string; origen: string; estado: string; creadaEn: Date },
  ev: Evaluacion,
): VistaConfiguracion {
  const total = ev.items.reduce(
    (s, i) => s.plus(new Prisma.Decimal(i.producto.precio).times(i.cantidad)),
    new Prisma.Decimal(0),
  );
  const faltantes = ev.items
    .filter((i) => !i.producto.activo || i.producto.disponible < i.cantidad)
    .map((i) => ({
      productoId: i.producto.id,
      disponible: i.producto.disponible,
      cantidad: i.cantidad,
    }));
  return {
    id: base.id,
    origen: base.origen,
    estado: base.estado,
    creadaEn: base.creadaEn.toISOString(),
    items: ev.items,
    total: total.toFixed(2),
    compatible: ev.compatible,
    rechazos: ev.rechazos,
    agregable: ev.compatible && ev.items.length > 0 && faltantes.length === 0,
    faltantes,
  };
}

/** Configuraciones del usuario con sesión (design D5 del Sprint 2). */
@Injectable()
export class ConfiguracionesService {
  constructor(private readonly compatibilidad: CompatibilidadService) {}

  private async propia(usuarioId: string, id: string) {
    if (!esUuid(id)) throw new NotFoundException(NO_EXISTE);
    const fila = await conPrisma((p) =>
      p.configuracion.findFirst({
        where: { id, usuarioId },
        select: {
          id: true,
          origen: true,
          estado: true,
          creadaEn: true,
          items: { select: { productoId: true, cantidad: true }, orderBy: { id: 'asc' } },
        },
      }),
    );
    // Ajena o inexistente: 404 igual, sin revelar que existe.
    if (!fila) throw new NotFoundException(NO_EXISTE);
    return fila;
  }

  async crear(usuarioId: string, items: ItemDto[]): Promise<VistaConfiguracion> {
    const ev = await this.compatibilidad.evaluar(items);
    // Escritura anidada: la configuración y sus ítems en una sola transacción.
    const creada = await conPrisma((p) =>
      p.configuracion.create({
        data: {
          usuarioId,
          origen: 'MANUAL',
          estado: ev.compatible ? 'VALIDA' : 'INVALIDA',
          items: { create: items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })) },
        },
        select: { id: true, origen: true, estado: true, creadaEn: true },
      }),
    );
    return vista(creada, ev);
  }

  async actualizar(usuarioId: string, id: string, items: ItemDto[]): Promise<VistaConfiguracion> {
    await this.propia(usuarioId, id);
    const ev = await this.compatibilidad.evaluar(items);
    const actualizada = await conPrisma((p) =>
      p.configuracion.update({
        where: { id },
        data: {
          estado: ev.compatible ? 'VALIDA' : 'INVALIDA',
          items: {
            deleteMany: {},
            create: items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
          },
        },
        select: { id: true, origen: true, estado: true, creadaEn: true },
      }),
    );
    return vista(actualizada, ev);
  }

  /** Recalcula con el catálogo actual; no reescribe el estado guardado. */
  async detalle(usuarioId: string, id: string): Promise<VistaConfiguracion> {
    const fila = await this.propia(usuarioId, id);
    const ev = await this.compatibilidad.evaluar(
      fila.items.map((i) => ({ ...i })),
      {
        estricto: false,
      },
    );
    return vista(fila, ev);
  }

  /**
   * Revalidación desde el historial (spec historial, HU-26): recalcula con las reglas y el
   * disponible vigentes y, a diferencia de `detalle`, guarda el estado resultante.
   */
  async revalidar(usuarioId: string, id: string): Promise<VistaConfiguracion> {
    const fila = await this.propia(usuarioId, id);
    const ev = await this.compatibilidad.evaluar(
      fila.items.map((i) => ({ ...i })),
      { estricto: false },
    );
    const estado = ev.compatible ? 'VALIDA' : 'INVALIDA';
    if (estado !== fila.estado) {
      await conPrisma((p) => p.configuracion.update({ where: { id }, data: { estado } }));
    }
    return vista({ ...fila, estado }, ev);
  }

  async listar(
    usuarioId: string,
    paginaTexto: string | undefined,
  ): Promise<{ configuraciones: ResumenConfiguracion[]; total: number; pagina: number }> {
    const pagina = paginaTexto === undefined ? 1 : Number(paginaTexto);
    if (!Number.isInteger(pagina) || pagina < 1) {
      throw new BadRequestException({
        codigo: 'SOLICITUD_INVALIDA',
        mensaje: 'pagina debe ser un entero positivo.',
      });
    }
    const [filas, total] = await conPrisma(async (p) => [
      await p.configuracion.findMany({
        where: { usuarioId },
        orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          estado: true,
          creadaEn: true,
          items: { select: { cantidad: true, producto: { select: { precio: true } } } },
        },
      }),
      await p.configuracion.count({ where: { usuarioId } }),
    ]);
    return {
      configuraciones: filas.map((f) => ({
        id: f.id,
        estado: f.estado,
        creadaEn: f.creadaEn.toISOString(),
        productos: f.items.reduce((s, i) => s + i.cantidad, 0),
        total: f.items
          .reduce((s, i) => s.plus(i.producto.precio.times(i.cantidad)), new Prisma.Decimal(0))
          .toFixed(2),
      })),
      total,
      pagina,
    };
  }
}
