import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CATEGORIAS, type CodigoCategoria, type TipoProducto } from './atributos';

/** Precio en soles como texto decimal con hasta 2 decimales (se acepta también un número). */
const PRECIO = /^\d{1,10}(\.\d{1,2})?$/;
const aTextoPrecio = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : value;
const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CrearProductoDto {
  @Transform(recortar)
  @IsString({ message: 'El nombre es obligatorio.' })
  @MinLength(1, { message: 'El nombre es obligatorio.' })
  @MaxLength(200, { message: 'El nombre no puede tener más de 200 caracteres.' })
  nombre: string;

  @Transform(recortar)
  @IsString({ message: 'La marca es obligatoria.' })
  @MinLength(1, { message: 'La marca es obligatoria.' })
  @MaxLength(60, { message: 'La marca no puede tener más de 60 caracteres.' })
  marca: string;

  @IsIn(CATEGORIAS, { message: `La categoría debe ser una de: ${CATEGORIAS.join(', ')}.` })
  categoria: CodigoCategoria;

  @IsIn(['COMPONENTE', 'EQUIPO'], { message: 'El tipo debe ser COMPONENTE o EQUIPO.' })
  tipo: TipoProducto;

  @Transform(aTextoPrecio)
  @Matches(PRECIO, { message: 'El precio debe ser un número no negativo con hasta 2 decimales.' })
  precio: string;

  @IsInt({ message: 'El stock inicial debe ser un entero.' })
  @Min(0, { message: 'El stock inicial no puede ser negativo.' })
  stockInicial: number;

  @IsObject({ message: 'Los atributos deben ser un objeto.' })
  atributos: Record<string, unknown>;
}

export class ActualizarProductoDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1, { message: 'El nombre no puede quedar vacío.' })
  @MaxLength(200, { message: 'El nombre no puede tener más de 200 caracteres.' })
  nombre?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1, { message: 'La marca no puede quedar vacía.' })
  @MaxLength(60, { message: 'La marca no puede tener más de 60 caracteres.' })
  marca?: string;

  @IsOptional()
  @Transform(aTextoPrecio)
  @Matches(PRECIO, { message: 'El precio debe ser un número no negativo con hasta 2 decimales.' })
  precio?: string;

  @IsOptional()
  @IsBoolean({ message: 'activo debe ser verdadero o falso.' })
  activo?: boolean;

  @IsOptional()
  @IsObject({ message: 'Los atributos deben ser un objeto.' })
  atributos?: Record<string, unknown>;
}

export class ActualizarStockDto {
  @IsInt({ message: 'La cantidad debe ser un entero.' })
  @Min(0, { message: 'La cantidad no puede ser negativa.' })
  cantidad: number;

  @IsInt({ message: 'La versión es obligatoria.' })
  @Min(0)
  version: number;
}

const ENTERO = /^\d+$/;

export const ORDENES = ['nombre', 'precio_asc', 'precio_desc'] as const;
export type Orden = (typeof ORDENES)[number];

/** Marcas del filtro: separadas por coma, sin vacías; null si hay más de 10 o alguna es larga. */
export function leerMarcas(texto: string | undefined): string[] | null {
  if (texto === undefined) return [];
  const marcas = [
    ...new Set(
      texto
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  ];
  if (marcas.length > 10 || marcas.some((m) => m.length > 60)) return null;
  return marcas;
}

/** Filtros del catálogo público: llegan como texto en la query. */
export class FiltrosCatalogoDto {
  @IsOptional()
  @IsIn(CATEGORIAS, { message: `La categoría debe ser una de: ${CATEGORIAS.join(', ')}.` })
  categoria?: CodigoCategoria;

  @IsOptional()
  @Matches(PRECIO, { message: 'precioMin debe ser un número no negativo.' })
  precioMin?: string;

  @IsOptional()
  @Matches(PRECIO, { message: 'precioMax debe ser un número no negativo.' })
  precioMax?: string;

  /** Una o varias marcas separadas por coma (Sprint 1.5, design D6). */
  @IsOptional()
  @IsString()
  @MaxLength(610, { message: 'Demasiadas marcas en el filtro.' })
  marca?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(30, { message: 'socket no puede tener más de 30 caracteres.' })
  socket?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(2, { message: 'La búsqueda debe tener al menos 2 caracteres.' })
  @MaxLength(60, { message: 'La búsqueda no puede tener más de 60 caracteres.' })
  q?: string;

  @IsOptional()
  @IsIn(ORDENES, { message: `orden debe ser uno de: ${ORDENES.join(', ')}.` })
  orden?: Orden;

  @IsOptional()
  @Matches(ENTERO, { message: 'pagina debe ser un entero positivo.' })
  pagina?: string;

  @IsOptional()
  @Matches(ENTERO, { message: 'porPagina debe ser un entero entre 1 y 100.' })
  porPagina?: string;
}

/** Facetas del catálogo público (design D7): opcionalmente de una categoría. */
export class FacetasDto {
  @IsOptional()
  @IsIn(CATEGORIAS, { message: `La categoría debe ser una de: ${CATEGORIAS.join(', ')}.` })
  categoria?: CodigoCategoria;
}

export class PaginaAdminDto {
  @IsOptional()
  @Matches(ENTERO, { message: 'pagina debe ser un entero positivo.' })
  pagina?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(2, { message: 'La búsqueda debe tener al menos 2 caracteres.' })
  @MaxLength(60, { message: 'La búsqueda no puede tener más de 60 caracteres.' })
  q?: string;

  @IsOptional()
  @IsIn(CATEGORIAS, { message: `La categoría debe ser una de: ${CATEGORIAS.join(', ')}.` })
  categoria?: CodigoCategoria;
}

export const POR_PAGINA = { porDefecto: 20, maximo: 100 } as const;

/** Convierte y valida la paginación; null si es inválida. */
export function leerPaginacion(
  pagina: string | undefined,
  porPagina: string | undefined,
): { pagina: number; porPagina: number } | null {
  const p = pagina === undefined ? 1 : Number(pagina);
  const n = porPagina === undefined ? POR_PAGINA.porDefecto : Number(porPagina);
  if (!Number.isInteger(p) || p < 1 || !Number.isInteger(n) || n < 1 || n > POR_PAGINA.maximo) {
    return null;
  }
  return { pagina: p, porPagina: n };
}
