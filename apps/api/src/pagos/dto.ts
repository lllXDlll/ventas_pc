import { Type } from 'class-transformer';
import { IsObject, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Datos de la tarjeta de prueba. Nunca se guardan ni se registran (spec pagos). */
export class TarjetaDto {
  @IsString({ message: 'El número de tarjeta es obligatorio.' })
  @MaxLength(30)
  numero: string;

  @IsString({ message: 'El vencimiento es obligatorio.' })
  @MaxLength(5)
  vencimiento: string;

  @IsString({ message: 'El CVV es obligatorio.' })
  @MaxLength(4)
  cvv: string;

  @IsString({ message: 'El titular es obligatorio.' })
  @MaxLength(100)
  titular: string;
}

export class PagoDto {
  @IsString()
  @Matches(UUID, { message: 'reservaId debe ser un identificador válido.' })
  reservaId: string;

  @IsObject({ message: 'Faltan los datos de la tarjeta.' })
  @ValidateNested()
  @Type(() => TarjetaDto)
  tarjeta: TarjetaDto;
}
