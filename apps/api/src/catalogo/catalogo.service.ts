import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { conPrisma } from '../datos/prisma';
import { Prisma } from '../generated/prisma/client';
import { DisponibleService } from '../reservas/disponible.service';
import { type CodigoCategoria, validarAtributos, validarTipo } from './atributos';
import type {
  ActualizarProductoDto,
  ActualizarStockDto,
  CrearProductoDto,
  FiltrosCatalogoDto,
} from './dto';
import { leerPaginacion } from './dto';

export interface ProductoPublico {
  id: string;
  nombre: string;
  categoria: { codigo: string; nombre: string };
  tipo: string;
  /** Texto decimal ("1299.00"): no se pierde precisión. */
  precio: string;
  disponible: number;
  agotado: boolean;
  atributos: Record<string, unknown>;
}

export interface ProductoAdmin extends ProductoPublico {
  activo: boolean;
  stock: { cantidad: number; version: number };
}

export interface Pagina<T> {
  productos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

const seleccion = {
  id: true,
  nombre: true,
  tipo: true,
  precio: true,
  activo: true,
  atributos: true,
  categoria: { select: { codigo: true, nombre: true } },
  stock: { select: { cantidad: true, version: true } },
} satisfies Prisma.ProductoSelect;

type Fila = Prisma.ProductoGetPayload<{ select: typeof seleccion }>;

function invalida(mensaje: string): BadRequestException {
  return new BadRequestException({ codigo: 'SOLICITUD_INVALIDA', mensaje });
}
const NO_EXISTE = { codigo: 'NO_ENCONTRADO', mensaje: 'El producto no existe.' };

/**
 * Catálogo administrable y público (spec catalogo, design.md D8 a D10 del Sprint 1).
 * La disponibilidad siempre sale de DisponibleService.
 */
@Injectable()
export class CatalogoService {
  constructor(private readonly disponible: DisponibleService) {}

  private async publicos(filas: Fila[]): Promise<ProductoAdmin[]> {
    const mapa = await this.disponible.disponibles(
      filas.map((f) => ({ productoId: f.id, stockFisico: f.stock?.cantidad ?? 0 })),
    );
    return filas.map((f) => {
      const disponible = mapa.get(f.id) ?? 0;
      return {
        id: f.id,
        nombre: f.nombre,
        categoria: f.categoria,
        tipo: f.tipo,
        precio: f.precio.toFixed(2),
        disponible,
        agotado: disponible === 0,
        atributos: (f.atributos ?? {}) as Record<string, unknown>,
        activo: f.activo,
        stock: { cantidad: f.stock?.cantidad ?? 0, version: f.stock?.version ?? 0 },
      };
    });
  }

  private static aPublico({ activo: _a, stock: _s, ...resto }: ProductoAdmin): ProductoPublico {
    return resto;
  }

  categorias(): Promise<{ codigo: string; nombre: string }[]> {
    return conPrisma((p) =>
      p.categoria.findMany({ select: { codigo: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    );
  }

  /** Catálogo público: activos con disponible mayor que cero, filtrado y paginado. */
  async listar(filtros: FiltrosCatalogoDto): Promise<Pagina<ProductoPublico>> {
    const paginacion = leerPaginacion(filtros.pagina, filtros.porPagina);
    if (!paginacion) throw invalida('pagina debe ser ≥ 1 y porPagina un entero entre 1 y 100.');
    const min = filtros.precioMin === undefined ? undefined : new Prisma.Decimal(filtros.precioMin);
    const max = filtros.precioMax === undefined ? undefined : new Prisma.Decimal(filtros.precioMax);
    if (min && max && min.greaterThan(max))
      throw invalida('precioMin no puede ser mayor que precioMax.');

    // Sprint 1: el disponible es el stock físico, así que el filtro "disponible > 0" va en SQL.
    const where: Prisma.ProductoWhereInput = {
      activo: true,
      stock: { cantidad: { gt: 0 } },
      ...(filtros.categoria ? { categoria: { codigo: filtros.categoria } } : {}),
      ...(min || max
        ? { precio: { ...(min ? { gte: min } : {}), ...(max ? { lte: max } : {}) } }
        : {}),
    };
    const { pagina, porPagina } = paginacion;
    const [filas, total] = await conPrisma(async (p) => [
      await p.producto.findMany({
        where,
        select: seleccion,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      await p.producto.count({ where }),
    ]);
    const productos = (await this.publicos(filas)).map(CatalogoService.aPublico);
    return { productos, total, pagina, porPagina };
  }

  /** Detalle público: un producto agotado se muestra; uno inactivo, 404. */
  async detalle(id: string): Promise<ProductoPublico> {
    const fila = await this.buscar(id);
    if (!fila || !fila.activo) throw new NotFoundException(NO_EXISTE);
    const [producto] = await this.publicos([fila]);
    return CatalogoService.aPublico(producto as ProductoAdmin);
  }

  private buscar(id: string): Promise<Fila | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve(null);
    return conPrisma((p) => p.producto.findUnique({ where: { id }, select: seleccion }));
  }

  async listarAdmin(paginaTexto: string | undefined): Promise<Pagina<ProductoAdmin>> {
    const paginacion = leerPaginacion(paginaTexto, '100');
    if (!paginacion) throw invalida('pagina debe ser un entero positivo.');
    const { pagina, porPagina } = paginacion;
    const [filas, total] = await conPrisma(async (p) => [
      await p.producto.findMany({
        select: seleccion,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      await p.producto.count(),
    ]);
    return { productos: await this.publicos(filas), total, pagina, porPagina };
  }

  async crear(dto: CrearProductoDto): Promise<ProductoAdmin> {
    const errorTipo = validarTipo(dto.categoria, dto.tipo);
    if (errorTipo) throw invalida(errorTipo);
    const errorAtributos = validarAtributos(dto.categoria, dto.atributos);
    if (errorAtributos) throw invalida(errorAtributos);

    const fila = await conPrisma(async (p) => {
      const categoria = await p.categoria.findUnique({ where: { codigo: dto.categoria } });
      if (!categoria) throw invalida(`La categoría ${dto.categoria} no está cargada.`);
      // Producto y stock en una sola escritura anidada (Prisma la hace en una transacción).
      return p.producto.create({
        data: {
          nombre: dto.nombre,
          categoriaId: categoria.id,
          tipo: dto.tipo,
          precio: new Prisma.Decimal(dto.precio),
          atributos: dto.atributos as Prisma.InputJsonValue,
          stock: { create: { cantidad: dto.stockInicial } },
        },
        select: seleccion,
      });
    });
    const [producto] = await this.publicos([fila]);
    return producto as ProductoAdmin;
  }

  async actualizar(id: string, dto: ActualizarProductoDto): Promise<ProductoAdmin> {
    const actual = await this.buscar(id);
    if (!actual) throw new NotFoundException(NO_EXISTE);
    if (dto.atributos) {
      const error = validarAtributos(actual.categoria.codigo as CodigoCategoria, dto.atributos);
      if (error) throw invalida(error);
    }
    const fila = await conPrisma((p) =>
      p.producto.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
          ...(dto.precio !== undefined ? { precio: new Prisma.Decimal(dto.precio) } : {}),
          ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
          ...(dto.atributos !== undefined
            ? { atributos: dto.atributos as Prisma.InputJsonValue }
            : {}),
        },
        select: seleccion,
      }),
    );
    const [producto] = await this.publicos([fila]);
    return producto as ProductoAdmin;
  }

  /** Bloqueo optimista (design.md D9): solo se guarda si la versión enviada es la vigente. */
  async actualizarStock(
    productoId: string,
    dto: ActualizarStockDto,
  ): Promise<{ cantidad: number; version: number }> {
    if (!/^[0-9a-f-]{36}$/i.test(productoId)) throw new NotFoundException(NO_EXISTE);
    return conPrisma(async (p) => {
      const { count } = await p.stock.updateMany({
        where: { productoId, version: dto.version },
        data: { cantidad: dto.cantidad, version: { increment: 1 } },
      });
      const vigente = await p.stock.findUnique({
        where: { productoId },
        select: { cantidad: true, version: true },
      });
      if (!vigente) throw new NotFoundException(NO_EXISTE);
      if (count === 0) {
        throw new ConflictException({
          codigo: 'CONFLICTO',
          mensaje:
            'El stock cambió desde que lo leíste. Revisa la cantidad vigente y vuelve a guardar.',
          detalle: vigente,
        });
      }
      return vigente;
    });
  }
}
