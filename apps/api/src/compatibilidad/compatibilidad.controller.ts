import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CompatibilidadService } from './compatibilidad.service';
import { ItemsDto } from './dto';
import type { Rechazo } from './motor/tipos';

/** Validación pública: el armador valida antes de iniciar sesión (design D4 del Sprint 2). */
@Controller('compatibilidad')
export class CompatibilidadController {
  constructor(private readonly compatibilidad: CompatibilidadService) {}

  @Post('validar')
  @HttpCode(200)
  async validar(@Body() dto: ItemsDto): Promise<{ compatible: boolean; rechazos: Rechazo[] }> {
    const { compatible, rechazos } = await this.compatibilidad.evaluar(dto.items);
    return { compatible, rechazos };
  }
}
