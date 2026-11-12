import { BadRequestException, ConflictException, HttpException, Injectable } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { conPrisma } from '../datos/prisma';
import {
  ConfirmacionService,
  MARGEN_CONFIRMACION_MS,
  type OrdenConfirmada,
} from '../reservas/confirmacion.service';
import type { PagoDto } from './dto';
import { autorizar, type ResultadoPago, TarjetaInvalida, ultimos4 } from './pago-simulado';

/** Pago simulado de una reserva (spec pagos, design D2 del Sprint 4). */
@Injectable()
export class PagosService {
  constructor(private readonly confirmacion: ConfirmacionService) {}

  async pagar(
    usuarioId: string,
    dto: PagoDto,
    clave: string | undefined,
  ): Promise<OrdenConfirmada> {
    if (typeof clave !== 'string' || clave.length < 8 || clave.length > 100) {
      throw new BadRequestException({
        codigo: 'SOLICITUD_INVALIDA',
        mensaje: 'Falta la clave de idempotencia (Idempotency-Key, de 8 a 100 caracteres).',
      });
    }
    // Reintento de una clave que ya produjo una orden: la original, sin autorizar de nuevo.
    if (await this.confirmacion.existeClave(clave)) {
      return this.confirmacion.confirmar(usuarioId, dto.reservaId, clave);
    }
    // No se "cobra" una reserva que no se podrá confirmar.
    const reserva = await conPrisma((p) =>
      p.reserva.findFirst({
        where: { id: dto.reservaId, usuarioId },
        select: { estado: true, venceEn: true },
      }),
    );
    if (
      !reserva ||
      reserva.estado !== 'ACTIVA' ||
      reserva.venceEn.getTime() <= Date.now() + MARGEN_CONFIRMACION_MS
    ) {
      throw new ConflictException({
        codigo: 'RESERVA_EXPIRADA',
        mensaje: 'Tu reserva expiró. Vuelve a iniciar la compra.',
      });
    }

    let resultado: ResultadoPago;
    try {
      resultado = autorizar(dto.tarjeta, env.PAGO_SIMULADO_FORZAR ?? '');
    } catch (error) {
      if (error instanceof TarjetaInvalida) {
        throw new BadRequestException({ codigo: 'SOLICITUD_INVALIDA', mensaje: error.message });
      }
      throw error;
    }
    if (resultado === 'RECHAZADO') {
      // La reserva sigue ACTIVA hasta su vencimiento: se puede reintentar.
      throw new HttpException(
        {
          codigo: 'PAGO_RECHAZADO',
          mensaje: 'El pago fue rechazado. Prueba con otra tarjeta antes de que venza tu reserva.',
        },
        402,
      );
    }
    return this.confirmacion.confirmar(usuarioId, dto.reservaId, clave, {
      ultimos4: ultimos4(dto.tarjeta.numero),
    });
  }
}
