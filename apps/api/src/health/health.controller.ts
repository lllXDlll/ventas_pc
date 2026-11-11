import { Controller, Get, HttpCode } from '@nestjs/common';

@Controller('health')
export class HealthController {
  /** Vida: no consulta ninguna dependencia (spec salud-api). */
  @Get('live')
  @HttpCode(200)
  live(): { estado: 'ok' } {
    return { estado: 'ok' };
  }
}
