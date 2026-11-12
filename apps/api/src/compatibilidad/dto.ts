import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un producto de la configuración con su cantidad (1 a 8). */
export class ItemDto {
  @IsString()
  @Matches(UUID, { message: 'productoId debe ser un identificador válido.' })
  productoId: string;

  @IsInt({ message: 'La cantidad debe ser un entero.' })
  @Min(1, { message: 'La cantidad mínima es 1.' })
  @Max(8, { message: 'La cantidad máxima por producto es 8.' })
  cantidad: number;
}

/** Productos a validar o guardar (spec motor-compatibilidad y configuraciones). */
export class ItemsDto {
  @IsArray({ message: 'items debe ser una lista.' })
  @ArrayMaxSize(30, { message: 'Una configuración admite como máximo 30 productos.' })
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}
