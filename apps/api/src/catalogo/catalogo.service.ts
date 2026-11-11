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
  Orden,
  PaginaAdminDto,
} from './dto';
import { leerMarcas, leerPaginacion } from './dto';

export interface ProductoPublico {
  id: string;
  nombre: string;
  /** Nula solo en productos previos al Sprint 1.5 que aún no la tienen. */
  marca: string | null;
  categoria: { codigo: string; nombre: string };
  tipo: string;
  /** Texto decimal ("1299.00"): no se pierde precisión. */
  precio: string;
  disponible: number;
  agotado: boolean;
  atributos: Record<string, unknown>;
  /** Ruta de la imagen en esta API (design D9), o null si no tiene. */
  imagenUrl: string | null;
}

export interface Faceta {
  valor: string;
  cantidad: number;
}

export interface Facetas {
  marcas: Faceta[];
  sockets: Faceta[];
  precio: { min: string; max: string } | null;
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
  marca: true,
  imagenClave: true,
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
/** Ruta pública de la imagen: el archivo es el último segmento de la clave en R2. */
export function rutaImagen(id: string, clave: string | null): string | null {
  return clave ? `/productos/${id}/imagen/${clave.slice(clave.lastIndexOf('/') + 1)}` : null;
}

const ORDEN: Record<Orden, Prisma.ProductoOrderByWithRelationInput[]> = {
  nombre: [{ nombre: 'asc' }, { id: 'asc' }],
  precio_asc: [{ precio: 'asc' }, { id: 'asc' }],
  precio_desc: [{ precio: 'desc' }, { id: 'asc' }],
};

/** Texto en nombre o marca, sin distinguir mayúsculas. */
function porTexto(q: string | undefined): Prisma.ProductoWhereInput[] {
  if (!q) return [];
  return [
    {
      OR: [
        { nombre: { contains: q, mode: 'insensitive' } },
        { marca: { contains: q, mode: 'insensitive' } },
      ],
    },
  ];
}

/** Activos con disponible mayor que cero (Sprint 1: el disponible es el stock físico). */
function publicoDisponible(categoria: string | undefined): Prisma.ProductoWhereInput {
  return {
    activo: true,
    stock: { cantidad: { gt: 0 } },
    ...(categoria ? { categoria: { codigo: categoria } } : {}),
  };
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
        marca: f.marca,
        categoria: f.categoria,
        tipo: f.tipo,
        precio: f.precio.toFixed(2),
        disponible,
        agotado: disponible === 0,
        atributos: (f.atributos ?? {}) as Record<string, unknown>,
        imagenUrl: rutaImagen(f.id, f.imagenClave),
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

    const marcas = leerMarcas(filtros.marca);
    if (!marcas) throw invalida('marca admite hasta 10 marcas de hasta 60 caracteres cada una.');

    // Sprint 1: el disponible es el stock físico, así que el filtro "disponible > 0" va en SQL.
    const where: Prisma.ProductoWhereInput = {
      ...publicoDisponible(filtros.categoria),
      ...(min || max
        ? { precio: { ...(min ? { gte: min } : {}), ...(max ? { lte: max } : {}) } }
        : {}),
      ...(filtros.socket ? { atributos: { path: ['socket'], equals: filtros.socket } } : {}),
      AND: [
        ...(marcas.length
          ? [{ OR: marcas.map((m) => ({ marca: { equals: m, mode: 'insensitive' as const } })) }]
          : []),
        ...porTexto(filtros.q),
      ],
    };
    const { pagina, porPagina } = paginacion;
    const [filas, total] = await conPrisma(async (p) => [
      await p.producto.findMany({
        where,
        select: seleccion,
        orderBy: ORDEN[filtros.orden ?? 'nombre'],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      await p.producto.count({ where }),
    ]);
    const productos = (await this.publicos(filas)).map(CatalogoService.aPublico);
    return { productos, total, pagina, porPagina };
  }

  /** Marcas y sockets con disponible, con su cantidad, y rango de precio (design D7). */
  async facetas(categoria: string | undefined): Promise<Facetas> {
    const where = publicoDisponible(categoria);
    const cat = categoria ?? null;
    const [marcas, sockets, precio] = await conPrisma(async (p) => [
      await p.producto.groupBy({
        by: ['marca'],
        where: { ...where, marca: { not: null } },
        _count: { _all: true },
        orderBy: { marca: 'asc' },
      }),
      // Prisma no agrupa por una ruta JSON: consulta con plantilla etiquetada (sin concatenar).
      await p.$queryRaw<{ valor: string; cantidad: number }[]>`
        SELECT p.atributos->>'socket' AS valor, count(*)::int AS cantidad
          FROM productos p
          JOIN stock s ON s.producto_id = p.id
          JOIN categorias c ON c.id = p.categoria_id
         WHERE p.activo AND s.cantidad > 0 AND p.atributos ? 'socket'
           AND (${cat}::text IS NULL OR c.codigo = ${cat}::text)
         GROUP BY 1
         ORDER BY 1`,
      await p.producto.aggregate({ where, _min: { precio: true }, _max: { precio: true } }),
    ]);
    return {
      marcas: marcas.map((m) => ({ valor: m.marca ?? '', cantidad: m._count._all })),
      sockets: sockets.map((x) => ({ valor: x.valor, cantidad: Number(x.cantidad) })),
      precio:
        precio._min.precio && precio._max.precio
          ? { min: precio._min.precio.toFixed(2), max: precio._max.precio.toFixed(2) }
          : null,
    };
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

  async listarAdmin(consulta: PaginaAdminDto): Promise<Pagina<ProductoAdmin>> {
    const paginacion = leerPaginacion(consulta.pagina, '100');
    if (!paginacion) throw invalida('pagina debe ser un entero positivo.');
    const { pagina, porPagina } = paginacion;
    // Incluye inactivos y agotados.
    const where: Prisma.ProductoWhereInput = {
      ...(consulta.categoria ? { categoria: { codigo: consulta.categoria } } : {}),
      AND: porTexto(consulta.q),
    };
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
          marca: dto.marca,
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
          ...(dto.marca !== undefined ? { marca: dto.marca } : {}),
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
