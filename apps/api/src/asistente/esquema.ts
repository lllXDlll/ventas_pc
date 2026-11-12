// Esquema de la respuesta del modelo (spec asistente, design D4 del Sprint 5) y su paso a
// productos. El modelo responde con alias de los candidatos, nunca con UUID.
import { z } from 'zod';
import type { ConfigRegla } from '../compatibilidad/motor/orquestador';
import type { Candidato } from './preseleccion';
import type { ItemRecomendado } from './tipos';
import { motivosDe } from './validacion';

export const RespuestaSchema = z.object({
  componentes: z
    .array(
      z.object({
        alias: z.string().regex(/^C\d+$/),
        cantidad: z.number().int().min(1).max(4),
        explicacion: z.string().min(1).max(300),
      }),
    )
    .min(7)
    .max(10),
  resumen: z.string().max(400),
});

export type RespuestaIA = z.infer<typeof RespuestaSchema>;

export interface Validada {
  ok: boolean;
  items: ItemRecomendado[];
  resumen: string;
  motivos: string[];
}

/**
 * Valida la respuesta (ya parseada o cruda): esquema, alias conocidos y luego las mismas
 * reglas que el respaldo (completa, disponible, presupuesto y motor).
 */
export function validarRecomendacion(
  respuesta: unknown,
  candidatos: readonly Candidato[],
  presupuestoCent: number,
  reglas: readonly ConfigRegla[],
): Validada {
  const parseada = RespuestaSchema.safeParse(respuesta);
  if (!parseada.success) {
    return {
      ok: false,
      items: [],
      resumen: '',
      motivos: [
        'La respuesta no cumple el formato pedido (cada componente necesita alias, cantidad y explicación).',
      ],
    };
  }
  const porAlias = new Map(candidatos.map((c) => [c.alias, c.producto]));
  const motivos: string[] = [];
  const items: ItemRecomendado[] = [];
  for (const c of parseada.data.componentes) {
    const producto = porAlias.get(c.alias);
    if (!producto) {
      motivos.push(`${c.alias} no está entre los candidatos.`);
      continue;
    }
    items.push({ producto, cantidad: c.cantidad, explicacion: c.explicacion });
  }
  motivos.push(...motivosDe(items, presupuestoCent, reglas));
  return { ok: motivos.length === 0, items, resumen: parseada.data.resumen, motivos };
}
