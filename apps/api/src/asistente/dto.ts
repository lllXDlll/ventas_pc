import { IsIn, IsNumber, Max, Min } from 'class-validator';
import { USOS, type Uso } from './tipos';

/** Consulta al asistente (spec asistente): presupuesto en soles y uso. */
export class RecomendarDto {
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'El presupuesto debe ser un número con hasta 2 decimales.' },
  )
  @Min(1, { message: 'El presupuesto mínimo es S/ 1.' })
  @Max(100000, { message: 'El presupuesto máximo es S/ 100000.' })
  presupuesto: number;

  @IsIn(USOS, { message: `El uso debe ser uno de: ${USOS.join(', ')}.` })
  uso: Uso;
}
