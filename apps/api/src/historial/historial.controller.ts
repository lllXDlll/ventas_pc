import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { SesionActual } from '../auth/auth.service';
import { RequiereSesion, SesionDeLaPeticion } from '../auth/guardas';
import {
  ConfiguracionesService,
  type VistaConfiguracion,
} from '../configuraciones/configuraciones.service';
import { HistorialService } from './historial.service';

/** Historial del usuario (spec historial): todo exige sesión y solo devuelve lo propio. */
@Controller('historial')
@RequiereSesion()
export class HistorialController {
  constructor(
    private readonly historial: HistorialService,
    private readonly configuracionesService: ConfiguracionesService,
  ) {}

  @Get('compras')
  compras(@SesionDeLaPeticion() s: SesionActual, @Query('pagina') pagina?: string) {
    return this.historial.compras(s.usuario.id, pagina);
  }

  @Get('compras/:id')
  compra(@SesionDeLaPeticion() s: SesionActual, @Param('id') id: string) {
    return this.historial.compra(s.usuario.id, id);
  }

  @Get('configuraciones')
  configuraciones(@SesionDeLaPeticion() s: SesionActual, @Query('pagina') pagina?: string) {
    return this.historial.configuraciones(s.usuario.id, pagina);
  }

  @Post('configuraciones/:id/revalidar')
  @HttpCode(200)
  revalidar(
    @SesionDeLaPeticion() s: SesionActual,
    @Param('id') id: string,
  ): Promise<VistaConfiguracion> {
    return this.configuracionesService.revalidar(s.usuario.id, id);
  }
}
