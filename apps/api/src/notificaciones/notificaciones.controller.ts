import { Controller, Get, Param, Patch } from '@nestjs/common';
import type { SesionActual } from '../auth/auth.service';
import { RequiereSesion, SesionDeLaPeticion } from '../auth/guardas';
import { NotificacionesService, type VistaNotificacion } from './notificaciones.service';

/** Notificaciones del usuario (spec notificaciones): todo exige sesión. */
@Controller('notificaciones')
@RequiereSesion()
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  listar(@SesionDeLaPeticion() s: SesionActual) {
    return this.notificaciones.listar(s.usuario.id);
  }

  @Patch(':id/leida')
  marcarLeida(
    @SesionDeLaPeticion() s: SesionActual,
    @Param('id') id: string,
  ): Promise<VistaNotificacion> {
    return this.notificaciones.marcarLeida(s.usuario.id, id);
  }
}
