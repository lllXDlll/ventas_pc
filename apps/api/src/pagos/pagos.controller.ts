import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import type { SesionActual } from '../auth/auth.service';
import { RequiereSesion, SesionDeLaPeticion } from '../auth/guardas';
import type { OrdenConfirmada } from '../reservas/confirmacion.service';
import { PagoDto } from './dto';
import { PagosService } from './pagos.service';

/** Pago de la reserva activa (spec pagos): exige sesión e Idempotency-Key. */
@Controller('pagos')
@RequiereSesion()
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  @Post('confirmar')
  @HttpCode(201)
  confirmar(
    @SesionDeLaPeticion() s: SesionActual,
    @Body() dto: PagoDto,
    @Headers('idempotency-key') clave: string | undefined,
  ): Promise<OrdenConfirmada> {
    return this.pagos.pagar(s.usuario.id, dto, clave);
  }
}
