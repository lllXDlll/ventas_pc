import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_CANTIDAD = 8;

/** Un producto suelto o una configuración propia (exactamente uno de los dos). */
export class AgregarAlCarritoDto {
  @IsOptional()
  @IsString()
  @Matches(UUID, { message: 'productoId debe ser un identificador válido.' })
  productoId?: string;

  @IsOptional()
  @IsString()
  @Matches(UUID, { message: 'configuracionId debe ser un identificador válido.' })
  configuracionId?: string;

  @IsInt({ message: 'La cantidad debe ser un entero.' })
  @Min(1, { message: 'La cantidad mínima es 1.' })
  @Max(MAX_CANTIDAD, { message: `La cantidad máxima es ${MAX_CANTIDAD}.` })
  cantidad: number;
}

export class CambiarCantidadDto {
  @IsInt({ message: 'La cantidad debe ser un entero.' })
  @Min(1, { message: 'La cantidad mínima es 1.' })
  @Max(MAX_CANTIDAD, { message: `La cantidad máxima es ${MAX_CANTIDAD}.` })
  cantidad: number;
}
