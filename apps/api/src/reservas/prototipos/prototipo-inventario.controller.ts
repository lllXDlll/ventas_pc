// TEMPORAL (Sprint 0, prueba 4 de HU-36b). Se elimina en la tarea 8.1.
// Expone el Durable Object Inventario por HTTP para medir reservas concurrentes
// a través del Worker completo. Solo responde si PROTOTIPO_TOKEN está configurado
// y la petición trae ese valor en la cabecera x-prototipo-token; si no, 404.
import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { env } from 'cloudflare:workers';
import type { Inventario, ResultadoReserva } from '../inventario';

interface CuerpoPreparar {
  instancia: string;
  productoId: string;
  cantidad: number;
}

interface CuerpoReservar {
  instancia: string;
  productoId: string;
  cantidad: number;
  ttlMs?: number;
}

function exigirToken(token: string | undefined): void {
  const esperado = (env as unknown as { PROTOTIPO_TOKEN?: string }).PROTOTIPO_TOKEN;
  if (!esperado || token !== esperado) throw new NotFoundException();
}

function inventario(instancia: unknown) {
  if (typeof instancia !== 'string' || instancia.length === 0 || instancia.length > 100) {
    throw new BadRequestException({ codigo: 'SOLICITUD_INVALIDA', mensaje: 'instancia inválida' });
  }
  const ns = env.INVENTARIO as DurableObjectNamespace<Inventario>;
  return ns.get(ns.idFromName(`prototipo:${instancia}`));
}

@Controller('__prototipo/inventario')
export class PrototipoInventarioController {
  @Post('preparar')
  async preparar(
    @Headers('x-prototipo-token') token: string | undefined,
    @Body() cuerpo: CuerpoPreparar,
  ): Promise<{ insertado: boolean; disponible: number | null }> {
    exigirToken(token);
    const inv = inventario(cuerpo.instancia);
    const insertado = await inv.reconstruir(cuerpo.productoId, cuerpo.cantidad);
    return { insertado, disponible: await inv.consultar(cuerpo.productoId) };
  }

  @Post('reservar')
  async reservar(
    @Headers('x-prototipo-token') token: string | undefined,
    @Body() cuerpo: CuerpoReservar,
  ): Promise<ResultadoReserva & { duracionMs: number }> {
    exigirToken(token);
    const inicio = Date.now();
    const resultado = await inventario(cuerpo.instancia).reservar(
      [{ productoId: cuerpo.productoId, cantidad: cuerpo.cantidad }],
      Date.now() + (cuerpo.ttlMs ?? 10 * 60_000),
    );
    // En Workers el reloj solo avanza con E/S: mide la espera de la llamada al objeto.
    return { ...resultado, duracionMs: Date.now() - inicio };
  }

  @Get('consultar')
  async consultar(
    @Headers('x-prototipo-token') token: string | undefined,
    @Query('instancia') instancia: string,
    @Query('productoId') productoId: string,
  ): Promise<{ disponible: number | null }> {
    exigirToken(token);
    return { disponible: await inventario(instancia).consultar(productoId) };
  }
}
