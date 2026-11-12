import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { SesionActual } from '../auth/auth.service';
import { RequiereSesion, SesionDeLaPeticion } from '../auth/guardas';
import { ReservasService, type VistaReserva } from './reservas.service';

/** Reservas del carrito (spec reservas): todo exige sesión. */
@Controller('reservas')
@RequiereSesion()
export class ReservasController {
  constructor(private readonly reservas: ReservasService) {}

  @Post()
  @HttpCode(201)
  reservar(@SesionDeLaPeticion() s: SesionActual): Promise<VistaReserva> {
    return this.reservas.reservar(s.usuario.id);
  }

  @Get('activa')
  activa(@SesionDeLaPeticion() s: SesionActual): Promise<VistaReserva> {
    return this.reservas.activa(s.usuario.id);
  }

  @Delete(':id')
  @HttpCode(204)
  async cancelar(@SesionDeLaPeticion() s: SesionActual, @Param('id') id: string): Promise<void> {
    await this.reservas.cancelar(s.usuario.id, id);
  }
}
