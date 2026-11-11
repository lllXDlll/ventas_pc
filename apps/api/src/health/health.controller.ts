import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  COMPROBADORES,
  type Comprobador,
  type ResultadoSalud,
  TIEMPO_ESPERA_MS,
  verificarSalud,
} from './salud.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(COMPROBADORES) private readonly comprobadores: Comprobador[],
    @Inject(TIEMPO_ESPERA_MS) private readonly tiempoEsperaMs: number,
  ) {}

  /** Vida: no consulta ninguna dependencia (spec salud-api). */
  @Get('live')
  @HttpCode(200)
  live(): { estado: 'ok' } {
    return { estado: 'ok' };
  }

  /** Preparación: 200 si Postgres y el almacén responden; 503 si alguno falla. */
  @Get('ready')
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ estado: 'ok' | 'no_listo' } & Pick<ResultadoSalud, 'dependencias'>> {
    const { listo, dependencias } = await verificarSalud(this.comprobadores, this.tiempoEsperaMs);
    res.status(listo ? 200 : 503);
    return { estado: listo ? 'ok' : 'no_listo', dependencias };
  }
}
