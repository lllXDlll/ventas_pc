import { Injectable, NotFoundException } from '@nestjs/common';
import { parametrosInvalidos } from '../comun/errores';
import {
  CODIGOS_REGLA,
  type CodigoRegla,
  type DescripcionParametro,
  ESQUEMA_PARAMETROS,
  NOMBRE_REGLA,
  PARAMETROS_POR_DEFECTO,
  validarParametros,
} from '../compatibilidad/motor/parametros';
import { conPrisma } from '../datos/prisma';
import type { ActualizarReglaDto } from './dto';

export interface VistaRegla {
  codigo: CodigoRegla;
  nombre: string;
  activa: boolean;
  parametros: Record<string, number>;
  descripcion: readonly DescripcionParametro[];
}

const NO_EXISTE = { codigo: 'NO_ENCONTRADO', mensaje: 'La regla no existe.' };

const esCodigo = (c: string): c is CodigoRegla => (CODIGOS_REGLA as readonly string[]).includes(c);

/** Solo los valores numéricos del esquema, con los de por defecto donde falten. */
function vigentes(codigo: CodigoRegla, guardados: unknown): Record<string, number> {
  const g = (guardados ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    ESQUEMA_PARAMETROS[codigo].map((d) => {
      const v = g[d.nombre];
      return [
        d.nombre,
        typeof v === 'number' ? v : (PARAMETROS_POR_DEFECTO[codigo][d.nombre] ?? 0),
      ];
    }),
  );
}

function vista(codigo: CodigoRegla, fila?: { activa: boolean; parametros: unknown }): VistaRegla {
  return {
    codigo,
    nombre: NOMBRE_REGLA[codigo],
    // Sin fila, el motor la evalúa activa y con los valores por defecto.
    activa: fila?.activa ?? true,
    parametros: vigentes(codigo, fila?.parametros),
    descripcion: ESQUEMA_PARAMETROS[codigo],
  };
}

/** Gestión de las reglas de compatibilidad (spec gestion-reglas, design D1 del Sprint 6). */
@Injectable()
export class ReglasService {
  async listar(): Promise<VistaRegla[]> {
    const filas = await conPrisma((p) =>
      p.reglaCompatibilidad.findMany({ select: { codigo: true, activa: true, parametros: true } }),
    );
    const porCodigo = new Map(filas.map((f) => [f.codigo as string, f]));
    return CODIGOS_REGLA.map((c) => vista(c, porCodigo.get(c)));
  }

  async actualizar(codigo: string, dto: ActualizarReglaDto): Promise<VistaRegla> {
    if (!esCodigo(codigo)) throw new NotFoundException(NO_EXISTE);
    let parametros: Record<string, number> | undefined;
    if (dto.parametros !== undefined) {
      const r = validarParametros(codigo, dto.parametros);
      if (!r.ok) throw parametrosInvalidos(r.mensaje);
      parametros = r.parametros;
    }
    const fila = await conPrisma((p) =>
      p.reglaCompatibilidad.upsert({
        where: { codigo },
        create: {
          codigo,
          activa: dto.activa ?? true,
          parametros: parametros ?? PARAMETROS_POR_DEFECTO[codigo],
        },
        update: {
          ...(dto.activa !== undefined ? { activa: dto.activa } : {}),
          ...(parametros ? { parametros } : {}),
        },
        select: { activa: true, parametros: true },
      }),
    );
    return vista(codigo, fila);
  }
}
