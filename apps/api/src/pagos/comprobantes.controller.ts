import { Controller, Get, Param } from '@nestjs/common';
import type { SesionActual } from '../auth/auth.service';
import { RequiereSesion, SesionDeLaPeticion } from '../auth/guardas';
import { ComprobantesService, type VistaComprobante } from './comprobantes.service';

/** Comprobante de una compra propia (spec comprobantes). */
@Controller('comprobantes')
@RequiereSesion()
export class ComprobantesController {
  constructor(private readonly comprobantes: ComprobantesService) {}

  @Get(':id')
  ver(@SesionDeLaPeticion() s: SesionActual, @Param('id') id: string): Promise<VistaComprobante> {
    return this.comprobantes.ver(s.usuario.id, id);
  }
}
