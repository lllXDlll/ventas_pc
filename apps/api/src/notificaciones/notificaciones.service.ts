import { Injectable, NotFoundException } from '@nestjs/common';
import { esUuid } from '../comun/uuid';
import { conPrisma } from '../datos/prisma';
import type { Prisma } from '../generated/prisma/client';

/** Tipos de notificación (spec notificaciones). La columna es texto libre. */
export const TIPO = {
  PRODUCTO_AGOTADO: 'PRODUCTO_AGOTADO',
  COMPRA_CONFIRMADA: 'COMPRA_CONFIRMADA',
} as const;
export type TipoNotificacion = (typeof TIPO)[keyof typeof TIPO];

export interface VistaNotificacion {
  id: string;
  tipo: string;
  mensaje: string;
  leida: boolean;
  creadaEn: string;
}

const ULTIMAS = 20;
const NO_EXISTE = { codigo: 'NO_ENCONTRADO', mensaje: 'La notificación no existe.' };
const seleccion = { id: true, tipo: true, mensaje: true, leida: true, creadaEn: true } as const;

const aVista = (n: {
  id: string;
  tipo: string;
  mensaje: string;
  leida: boolean;
  creadaEn: Date;
}): VistaNotificacion => ({ ...n, creadaEn: n.creadaEn.toISOString() });

/** Notificaciones dentro de la aplicación (spec notificaciones, design D4 del Sprint 4). */
@Injectable()
export class NotificacionesService {
  /** Crea una notificación; `tx` permite crearla dentro de otra transacción. */
  async crear(
    tx: Prisma.TransactionClient,
    usuarioId: string,
    tipo: TipoNotificacion,
    mensaje: string,
  ): Promise<void> {
    await tx.notificacion.create({ data: { usuarioId, tipo, mensaje } });
  }

  /** Crea la notificación solo si el usuario no tiene ya una igual sin leer (una consulta). */
  async crearSiNoHay(usuarioId: string, tipo: TipoNotificacion, mensaje: string): Promise<void> {
    await conPrisma(
      (p) => p.$executeRaw`
        INSERT INTO notificaciones (id, usuario_id, tipo, mensaje)
        SELECT gen_random_uuid(), ${usuarioId}::uuid, ${tipo}, ${mensaje}
         WHERE NOT EXISTS (
           SELECT 1 FROM notificaciones
            WHERE usuario_id = ${usuarioId}::uuid AND tipo = ${tipo}
              AND mensaje = ${mensaje} AND NOT leida)`,
    );
  }

  async listar(
    usuarioId: string,
  ): Promise<{ notificaciones: VistaNotificacion[]; noLeidas: number }> {
    const [filas, noLeidas] = await conPrisma(async (p) => [
      await p.notificacion.findMany({
        where: { usuarioId },
        orderBy: [{ creadaEn: 'desc' }, { id: 'desc' }],
        take: ULTIMAS,
        select: seleccion,
      }),
      await p.notificacion.count({ where: { usuarioId, leida: false } }),
    ]);
    return { notificaciones: filas.map(aVista), noLeidas };
  }

  /** Marca como leída una notificación propia; repetirlo no es error. Ajena: 404. */
  async marcarLeida(usuarioId: string, id: string): Promise<VistaNotificacion> {
    if (!esUuid(id)) throw new NotFoundException(NO_EXISTE);
    const fila = await conPrisma(async (p) => {
      const { count } = await p.notificacion.updateMany({
        where: { id, usuarioId },
        data: { leida: true },
      });
      return count === 0 ? null : p.notificacion.findFirst({ where: { id }, select: seleccion });
    });
    if (!fila) throw new NotFoundException(NO_EXISTE);
    return aVista(fila);
  }
}
