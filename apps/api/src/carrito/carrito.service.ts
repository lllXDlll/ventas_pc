import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { rutaImagen } from '../catalogo/catalogo.service';
import { CompatibilidadService } from '../compatibilidad/compatibilidad.service';
import { conPrisma } from '../datos/prisma';
import { Prisma } from '../generated/prisma/client';
import { DisponibleService } from '../reservas/disponible.service';
import { type AgregarAlCarritoDto, MAX_CANTIDAD } from './dto';

const seleccionProducto = {
  id: true,
  nombre: true,
  marca: true,
  precio: true,
  activo: true,
  imagenClave: true,
  atributos: true,
  categoria: { select: { codigo: true, nombre: true } },
  stock: { select: { cantidad: true } },
} satisfies Prisma.ProductoSelect;

type FilaProducto = Prisma.ProductoGetPayload<{ select: typeof seleccionProducto }>;

export interface ProductoCarrito {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: { codigo: string; nombre: string };
  precio: string;
  activo: boolean;
  disponible: number;
  imagenUrl: string | null;
}

export interface ItemCarrito {
  id: string;
  tipo: 'PRODUCTO' | 'CONFIGURACION';
  cantidad: number;
  producto?: ProductoCarrito;
  configuracion?: { id: string; productos: { producto: ProductoCarrito; cantidad: number }[] };
  subtotal: string;
  /** Algún producto del ítem está inactivo o no tiene disponible suficiente. */
  sinDisponible: boolean;
}

export interface VistaCarrito {
  items: ItemCarrito[];
  total: string;
  /** Unidades de producto (para el contador de la cabecera). */
  cantidadProductos: number;
}

const NO_EXISTE_ITEM = { codigo: 'NO_ENCONTRADO', mensaje: 'El ítem no está en tu carrito.' };
const esUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const invalida = (mensaje: string) =>
  new BadRequestException({ codigo: 'SOLICITUD_INVALIDA', mensaje });

/** Carrito del usuario con sesión (spec carrito, design D6 del Sprint 3). */
@Injectable()
export class CarritoService {
  constructor(
    private readonly compatibilidad: CompatibilidadService,
    private readonly disponible: DisponibleService,
  ) {}

  private filas(usuarioId: string) {
    return conPrisma((p) =>
      p.carrito.findFirst({
        where: { usuarioId },
        select: {
          id: true,
          items: {
            orderBy: { id: 'asc' },
            select: {
              id: true,
              cantidad: true,
              producto: { select: seleccionProducto },
              configuracion: {
                select: {
                  id: true,
                  items: {
                    orderBy: { id: 'asc' },
                    select: { cantidad: true, producto: { select: seleccionProducto } },
                  },
                },
              },
            },
          },
        },
      }),
    );
  }

  async ver(usuarioId: string): Promise<VistaCarrito> {
    const carrito = await this.filas(usuarioId);
    const items = carrito?.items ?? [];
    // Disponible de todos los productos del carrito en una llamada al almacén.
    const todos = new Map<string, FilaProducto>();
    for (const i of items) {
      if (i.producto) todos.set(i.producto.id, i.producto);
      for (const c of i.configuracion?.items ?? []) todos.set(c.producto.id, c.producto);
    }
    const disponibles = await this.disponible.disponibles(
      [...todos.values()].map((f) => ({ productoId: f.id, stockFisico: f.stock?.cantidad ?? 0 })),
    );
    const aVista = (f: FilaProducto): ProductoCarrito => ({
      id: f.id,
      nombre: f.nombre,
      marca: f.marca,
      categoria: f.categoria,
      precio: f.precio.toFixed(2),
      activo: f.activo,
      disponible: f.activo ? (disponibles.get(f.id) ?? 0) : 0,
      imagenUrl: rutaImagen(f.id, f.imagenClave),
    });

    let total = new Prisma.Decimal(0);
    let cantidadProductos = 0;
    const vista = items.map((i): ItemCarrito => {
      if (i.producto) {
        const producto = aVista(i.producto);
        const subtotal = i.producto.precio.times(i.cantidad);
        total = total.plus(subtotal);
        cantidadProductos += i.cantidad;
        return {
          id: i.id,
          tipo: 'PRODUCTO',
          cantidad: i.cantidad,
          producto,
          subtotal: subtotal.toFixed(2),
          sinDisponible: producto.disponible < i.cantidad,
        };
      }
      const productos = (i.configuracion?.items ?? []).map((c) => ({
        producto: aVista(c.producto),
        cantidad: c.cantidad,
      }));
      const unidad = (i.configuracion?.items ?? []).reduce(
        (s, c) => s.plus(c.producto.precio.times(c.cantidad)),
        new Prisma.Decimal(0),
      );
      const subtotal = unidad.times(i.cantidad);
      total = total.plus(subtotal);
      cantidadProductos += productos.reduce((s, c) => s + c.cantidad, 0) * i.cantidad;
      return {
        id: i.id,
        tipo: 'CONFIGURACION',
        cantidad: i.cantidad,
        configuracion: { id: i.configuracion?.id ?? '', productos },
        subtotal: subtotal.toFixed(2),
        sinDisponible: productos.some((c) => c.producto.disponible < c.cantidad * i.cantidad),
      };
    });
    return { items: vista, total: total.toFixed(2), cantidadProductos };
  }

  private async carritoId(usuarioId: string): Promise<string> {
    return conPrisma(async (p) => {
      const c = await p.carrito.upsert({
        where: { usuarioId },
        create: { usuarioId },
        update: {},
        select: { id: true },
      });
      return c.id;
    });
  }

  async agregar(usuarioId: string, dto: AgregarAlCarritoDto): Promise<VistaCarrito> {
    if (Boolean(dto.productoId) === Boolean(dto.configuracionId)) {
      throw invalida('Indica un producto o una configuración (uno de los dos).');
    }
    if (dto.productoId) {
      const producto = await conPrisma((p) =>
        p.producto.findFirst({
          where: { id: dto.productoId },
          select: { activo: true, nombre: true, categoria: { select: { codigo: true } } },
        }),
      );
      if (!producto) throw invalida('El producto no existe.');
      if (!producto.activo) throw invalida(`El producto «${producto.nombre}» no está disponible.`);
    } else {
      const config = await conPrisma((p) =>
        p.configuracion.findFirst({
          where: { id: dto.configuracionId, usuarioId },
          select: { items: { select: { productoId: true, cantidad: true } } },
        }),
      );
      if (!config) {
        throw new NotFoundException({
          codigo: 'NO_ENCONTRADO',
          mensaje: 'La configuración no existe.',
        });
      }
      if (config.items.length === 0) throw invalida('La configuración no tiene productos.');
      // Revalidación al agregar (spec carrito): una incompatible no entra.
      const ev = await this.compatibilidad.evaluar(config.items);
      if (!ev.compatible) {
        throw new ConflictException({
          codigo: 'CONFIGURACION_INCOMPATIBLE',
          mensaje: 'La configuración tiene incompatibilidades y no se puede agregar al carrito.',
          detalle: { rechazos: ev.rechazos },
        });
      }
    }

    const carritoId = await this.carritoId(usuarioId);
    await conPrisma(async (p) => {
      const existente = await p.carritoItem.findFirst({
        where: dto.productoId
          ? { carritoId, productoId: dto.productoId }
          : { carritoId, configuracionId: dto.configuracionId },
        select: { id: true, cantidad: true },
      });
      if (existente) {
        await p.carritoItem.update({
          where: { id: existente.id },
          data: { cantidad: Math.min(MAX_CANTIDAD, existente.cantidad + dto.cantidad) },
        });
      } else {
        await p.carritoItem.create({
          data: {
            carritoId,
            productoId: dto.productoId ?? null,
            configuracionId: dto.configuracionId ?? null,
            cantidad: dto.cantidad,
          },
        });
      }
      await p.carrito.update({ where: { id: carritoId }, data: { actualizadoEn: new Date() } });
    });
    return this.ver(usuarioId);
  }

  private async itemPropio(usuarioId: string, itemId: string) {
    if (!esUuid(itemId)) throw new NotFoundException(NO_EXISTE_ITEM);
    const item = await conPrisma((p) =>
      p.carritoItem.findFirst({
        where: { id: itemId, carrito: { usuarioId } },
        select: { id: true },
      }),
    );
    if (!item) throw new NotFoundException(NO_EXISTE_ITEM);
  }

  async cambiarCantidad(usuarioId: string, itemId: string, cantidad: number) {
    await this.itemPropio(usuarioId, itemId);
    await conPrisma((p) => p.carritoItem.update({ where: { id: itemId }, data: { cantidad } }));
    return this.ver(usuarioId);
  }

  async quitar(usuarioId: string, itemId: string) {
    await this.itemPropio(usuarioId, itemId);
    await conPrisma((p) => p.carritoItem.delete({ where: { id: itemId } }));
    return this.ver(usuarioId);
  }

  async vaciar(usuarioId: string): Promise<VistaCarrito> {
    await conPrisma((p) => p.carritoItem.deleteMany({ where: { carrito: { usuarioId } } }));
    return { items: [], total: '0.00', cantidadProductos: 0 };
  }

  /**
   * Productos del carrito para reservar (design D3): configuraciones expandidas y
   * cantidades sumadas por producto. Valida que estén activos.
   */
  async productos(usuarioId: string): Promise<{ productoId: string; cantidad: number }[]> {
    const carrito = await this.filas(usuarioId);
    const total = new Map<string, number>();
    const sumar = (f: FilaProducto, n: number) => {
      if (!f.activo) throw invalida(`El producto «${f.nombre}» ya no está disponible: quítalo.`);
      total.set(f.id, (total.get(f.id) ?? 0) + n);
    };
    for (const i of carrito?.items ?? []) {
      if (i.producto) sumar(i.producto, i.cantidad);
      for (const c of i.configuracion?.items ?? []) sumar(c.producto, c.cantidad * i.cantidad);
    }
    return [...total].map(([productoId, cantidad]) => ({ productoId, cantidad }));
  }
}
