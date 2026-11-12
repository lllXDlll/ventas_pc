import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { RequiereSesion, SesionDeLaPeticion } from '../auth/guardas';
import type { SesionActual } from '../auth/auth.service';
import { ItemsDto } from '../compatibilidad/dto';
import { ConfiguracionesService, type VistaConfiguracion } from './configuraciones.service';

/** Configuraciones del usuario (spec configuraciones): todo exige sesión. */
@Controller('configuraciones')
@RequiereSesion()
export class ConfiguracionesController {
  constructor(private readonly configuraciones: ConfiguracionesService) {}

  @Post()
  @HttpCode(201)
  crear(
    @SesionDeLaPeticion() sesion: SesionActual,
    @Body() dto: ItemsDto,
  ): Promise<VistaConfiguracion> {
    return this.configuraciones.crear(sesion.usuario.id, dto.items);
  }

  @Get()
  listar(@SesionDeLaPeticion() sesion: SesionActual, @Query('pagina') pagina?: string) {
    return this.configuraciones.listar(sesion.usuario.id, pagina);
  }

  @Get(':id')
  detalle(
    @SesionDeLaPeticion() sesion: SesionActual,
    @Param('id') id: string,
  ): Promise<VistaConfiguracion> {
    return this.configuraciones.detalle(sesion.usuario.id, id);
  }

  @Patch(':id')
  actualizar(
    @SesionDeLaPeticion() sesion: SesionActual,
    @Param('id') id: string,
    @Body() dto: ItemsDto,
  ): Promise<VistaConfiguracion> {
    return this.configuraciones.actualizar(sesion.usuario.id, id, dto.items);
  }
}
