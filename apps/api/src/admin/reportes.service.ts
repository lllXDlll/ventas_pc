import { BadRequestException, Injectable } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { USOS, type Uso } from '../asistente/tipos';
import { conPrisma } from '../datos/prisma';
import type { RangoReporteDto } from './dto';
import { type Rango, rangoDeFechas } from './rango';

/** Precio por millón de tokens, en US$ (design D3). El costo del reporte es estimado. */
export const PRECIOS_MODELO: Readonly<Record<string, { entrada: number; salida: number }>> = {
  'claude-opus-5-5': { entrada: 4, salida: 20 },
};

export function costoEstimado(modelo: string, entrada: number, salida: number): number {
  const precio = PRECIOS_MODELO[modelo] ?? PRECIOS_MODELO['claude-opus-5-5']!;
  return Number(((entrada * precio.entrada + salida * precio.salida) / 1_000_000).toFixed(4));
}

/** Porcentaje con un decimal; 0 si no hay total. */
export const porcentaje = (parte: number, total: number) =>
  total ? Math.round((parte / total) * 1000) / 10 : 0;

interface RangoVista {
  desde: string;
  hasta: string;
}

export interface ReporteVentas {
  rango: RangoVista;
  totalVendido: string;
  ordenes: number;
  ticketPromedio: string;
  productos: { productoId: string; nombre: string; unidades: number; importe: string }[];
  serie: { fecha: string; total: string; ordenes: number }[];
}

export interface ReporteAsistente {
  rango: RangoVista;
  consultas: number;
  conRespaldo: number;
  porcentajeRespaldo: number;
  latenciaPromedioMs: number;
  porUso: { uso: Uso; consultas: number; porcentajeRespaldo: number }[];
  motivos: { motivo: string; consultas: number }[];
  tokens: { entrada: number; salida: number };
  modelo: string;
  costoEstimadoUsd: number;
}

function rango(consulta: RangoReporteDto): Rango {
  const r = rangoDeFechas(consulta);
  if (!r.ok) throw new BadRequestException({ codigo: 'SOLICITUD_INVALIDA', mensaje: r.mensaje });
  return r.rango;
}

/** Reportes del panel (spec reportes, design D3): agregación en SQL, importes en texto. */
@Injectable()
export class ReportesService {
  async ventas(consulta: RangoReporteDto): Promise<ReporteVentas> {
    const r = rango(consulta);
    return conPrisma(async (p) => {
      const [totales] = await p.$queryRaw<{ ordenes: number; total: string; promedio: string }[]>`
        SELECT count(*)::int AS ordenes,
               coalesce(sum(total), 0)::numeric(14, 2)::text AS total,
               coalesce(round(avg(total), 2), 0)::numeric(14, 2)::text AS promedio
          FROM ordenes
         WHERE creada_en >= ${r.inicio} AND creada_en < ${r.fin}`;
      const dias = await p.$queryRaw<{ fecha: string; total: string; ordenes: number }[]>`
        SELECT to_char(creada_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS fecha,
               sum(total)::numeric(14, 2)::text AS total,
               count(*)::int AS ordenes
          FROM ordenes
         WHERE creada_en >= ${r.inicio} AND creada_en < ${r.fin}
         GROUP BY 1`;
      const productos = await p.$queryRaw<
        { productoId: string; nombre: string; unidades: number; importe: string }[]
      >`
        SELECT pr.id::text AS "productoId", pr.nombre,
               sum(i.cantidad)::int AS unidades,
               sum(i.cantidad * i.precio_unitario)::numeric(14, 2)::text AS importe
          FROM orden_items i
          JOIN ordenes o ON o.id = i.orden_id
          JOIN productos pr ON pr.id = i.producto_id
         WHERE o.creada_en >= ${r.inicio} AND o.creada_en < ${r.fin}
         GROUP BY pr.id, pr.nombre
         ORDER BY unidades DESC, sum(i.cantidad * i.precio_unitario) DESC, pr.nombre
         LIMIT 10`;
      const porDia = new Map(dias.map((d) => [d.fecha, d]));
      return {
        rango: { desde: r.desde, hasta: r.hasta },
        totalVendido: totales?.total ?? '0.00',
        ordenes: totales?.ordenes ?? 0,
        ticketPromedio: totales?.promedio ?? '0.00',
        productos,
        // Un punto por día del rango, también los días sin ventas.
        serie: r.dias.map((fecha) => ({
          fecha,
          total: porDia.get(fecha)?.total ?? '0.00',
          ordenes: porDia.get(fecha)?.ordenes ?? 0,
        })),
      };
    });
  }

  async asistente(consulta: RangoReporteDto): Promise<ReporteAsistente> {
    const r = rango(consulta);
    const modelo = env.IA_MODELO || 'claude-opus-5-5';
    return conPrisma(async (p) => {
      const [t] = await p.$queryRaw<
        { consultas: number; respaldo: number; latencia: number; entrada: number; salida: number }[]
      >`
        SELECT count(*)::int AS consultas,
               (count(*) FILTER (WHERE uso_respaldo))::int AS respaldo,
               coalesce(round(avg(latencia_ms)), 0)::int AS latencia,
               coalesce(sum((resultado -> 'tokens' ->> 'entrada')::int), 0)::int AS entrada,
               coalesce(sum((resultado -> 'tokens' ->> 'salida')::int), 0)::int AS salida
          FROM uso_asistente
         WHERE creado_en >= ${r.inicio} AND creado_en < ${r.fin}`;
      const usos = await p.$queryRaw<{ uso: string; consultas: number; respaldo: number }[]>`
        SELECT uso, count(*)::int AS consultas,
               (count(*) FILTER (WHERE uso_respaldo))::int AS respaldo
          FROM uso_asistente
         WHERE creado_en >= ${r.inicio} AND creado_en < ${r.fin}
         GROUP BY uso`;
      const motivos = await p.$queryRaw<{ motivo: string; consultas: number }[]>`
        SELECT coalesce(resultado ->> 'motivo', 'SIN_MOTIVO') AS motivo, count(*)::int AS consultas
          FROM uso_asistente
         WHERE creado_en >= ${r.inicio} AND creado_en < ${r.fin} AND uso_respaldo
         GROUP BY 1
         ORDER BY 2 DESC, 1`;
      const consultas = t?.consultas ?? 0;
      const respaldo = t?.respaldo ?? 0;
      const tokens = { entrada: t?.entrada ?? 0, salida: t?.salida ?? 0 };
      const porUso = new Map(usos.map((u) => [u.uso, u]));
      return {
        rango: { desde: r.desde, hasta: r.hasta },
        consultas,
        conRespaldo: respaldo,
        porcentajeRespaldo: porcentaje(respaldo, consultas),
        latenciaPromedioMs: t?.latencia ?? 0,
        porUso: USOS.map((uso) => {
          const u = porUso.get(uso);
          return {
            uso,
            consultas: u?.consultas ?? 0,
            porcentajeRespaldo: porcentaje(u?.respaldo ?? 0, u?.consultas ?? 0),
          };
        }),
        motivos,
        tokens,
        modelo,
        costoEstimadoUsd: costoEstimado(modelo, tokens.entrada, tokens.salida),
      };
    });
  }
}
