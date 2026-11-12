import { Injectable } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { DemasiadasPeticiones } from '../comun/errores';
import { conPrisma, conTransaccion } from '../datos/prisma';

const VENTANA_MS = 24 * 60 * 60 * 1000;

export interface EstadoLimite {
  limite: number;
  usadas: number;
  /** Cuándo vuelve a haber cupo, si no queda ninguno. */
  disponibleDesde: string | null;
}

export function limiteAsistente(valor = env.ASISTENTE_LIMITE_24H): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : 10;
}

/**
 * Límite de consultas del asistente (spec asistente, design D7 del Sprint 5): contado desde
 * `uso_asistente` en Postgres, nunca en memoria. La reserva toma un bloqueo por usuario para
 * que dos consultas simultáneas no superen el límite.
 */
@Injectable()
export class LimiteAsistenteService {
  /** Reserva una consulta: inserta su fila de uso y devuelve su id, o lanza 429. */
  async reservar(usuarioId: string, presupuesto: string, uso: string): Promise<string> {
    const limite = limiteAsistente();
    return conTransaccion(async (tx) => {
      // Serializa solo las consultas de este usuario; termina con la transacción.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${usuarioId}, 0))`;
      const desde = new Date(Date.now() - VENTANA_MS);
      const usadas = await tx.usoAsistente.count({
        where: { usuarioId, creadoEn: { gt: desde } },
      });
      if (usadas >= limite) {
        const primera = await tx.usoAsistente.findFirst({
          where: { usuarioId, creadoEn: { gt: desde } },
          orderBy: { creadoEn: 'asc' },
          select: { creadoEn: true },
        });
        const libre = new Date((primera?.creadoEn.getTime() ?? Date.now()) + VENTANA_MS);
        throw new DemasiadasPeticiones(
          Math.max(1, Math.ceil((libre.getTime() - Date.now()) / 1000)),
          `Usaste tus ${limite} consultas al asistente de las últimas 24 horas.`,
          {
            codigo: 'LIMITE_ASISTENTE',
            detalle: { limite, usadas, disponibleDesde: libre.toISOString() },
          },
        );
      }
      const fila = await tx.usoAsistente.create({
        data: { usuarioId, presupuesto, uso, latenciaMs: 0 },
        select: { id: true },
      });
      return fila.id;
    });
  }

  async estado(usuarioId: string): Promise<EstadoLimite> {
    const limite = limiteAsistente();
    const desde = new Date(Date.now() - VENTANA_MS);
    const filas = await conPrisma((p) =>
      p.usoAsistente.findMany({
        where: { usuarioId, creadoEn: { gt: desde } },
        orderBy: { creadoEn: 'asc' },
        select: { creadoEn: true },
      }),
    );
    const usadas = filas.length;
    const disponibleDesde =
      usadas >= limite && filas[0]
        ? new Date(filas[0].creadoEn.getTime() + VENTANA_MS).toISOString()
        : null;
    return { limite, usadas, disponibleDesde };
  }
}
