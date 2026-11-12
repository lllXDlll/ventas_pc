import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/guardas';
import { RangoReporteDto } from './dto';
import { type ReporteAsistente, type ReporteVentas, ReportesService } from './reportes.service';

/** Reportes del panel (spec reportes): solo ADMIN. */
@Controller('admin/reportes')
@Roles('ADMIN')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('ventas')
  ventas(@Query() consulta: RangoReporteDto): Promise<ReporteVentas> {
    return this.reportes.ventas(consulta);
  }

  @Get('asistente')
  asistente(@Query() consulta: RangoReporteDto): Promise<ReporteAsistente> {
    return this.reportes.asistente(consulta);
  }
}
