import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Roles } from '../auth/guardas';
import { ActualizarReglaDto } from './dto';
import { ReglasService, type VistaRegla } from './reglas.service';

/** Reglas de compatibilidad editables por el administrador (spec gestion-reglas). */
@Controller('admin/reglas')
@Roles('ADMIN')
export class ReglasController {
  constructor(private readonly reglas: ReglasService) {}

  @Get()
  listar(): Promise<VistaRegla[]> {
    return this.reglas.listar();
  }

  @Patch(':codigo')
  actualizar(
    @Param('codigo') codigo: string,
    @Body() dto: ActualizarReglaDto,
  ): Promise<VistaRegla> {
    return this.reglas.actualizar(codigo, dto);
  }
}
