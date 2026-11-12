import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import type { SesionActual } from '../auth/auth.service';
import { RequiereSesion, SesionDeLaPeticion } from '../auth/guardas';
import { AsistenteService, type Recomendacion } from './asistente.service';
import { RecomendarDto } from './dto';
import { type EstadoLimite, LimiteAsistenteService } from './limite.service';

/** Asistente de IA (spec asistente): todo exige sesión. */
@Controller('asistente')
@RequiereSesion()
export class AsistenteController {
  constructor(
    private readonly asistente: AsistenteService,
    private readonly limite: LimiteAsistenteService,
  ) {}

  /** x-ia-simulado solo se honra con IA_PROVEEDOR=simulado (pruebas y CI). */
  @Post('recomendar')
  @HttpCode(201)
  recomendar(
    @SesionDeLaPeticion() s: SesionActual,
    @Body() dto: RecomendarDto,
    @Headers('x-ia-simulado') escenario?: string,
  ): Promise<Recomendacion> {
    return this.asistente.recomendar(s.usuario.id, dto, escenario);
  }

  @Get('limite')
  limiteDe(@SesionDeLaPeticion() s: SesionActual): Promise<EstadoLimite> {
    return this.limite.estado(s.usuario.id);
  }
}
