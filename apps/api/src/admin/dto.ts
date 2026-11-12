import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

/** Forma del cambio de una regla; los parámetros se validan por regla en el servicio (D1). */
export class ActualizarReglaDto {
  @IsOptional()
  @IsBoolean({ message: '«activa» debe ser verdadero o falso.' })
  activa?: boolean;

  @IsOptional()
  @IsObject({ message: 'Los parámetros deben ser un objeto.' })
  parametros?: Record<string, unknown>;
}

/** Rango de un reporte; el formato y los límites los valida rangoDeFechas (D2). */
export class RangoReporteDto {
  @IsOptional()
  @IsString({ message: '«desde» debe ser una fecha AAAA-MM-DD.' })
  desde?: string;

  @IsOptional()
  @IsString({ message: '«hasta» debe ser una fecha AAAA-MM-DD.' })
  hasta?: string;
}
