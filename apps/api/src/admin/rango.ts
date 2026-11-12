// Rango de fechas de los reportes (spec reportes, design D2 del Sprint 6): fechas
// AAAA-MM-DD inclusivas en hora de Lima. Lima no tiene horario de verano: UTC−5 fijo.

export const MAX_DIAS = 366;
export const DIAS_POR_DEFECTO = 30;
const DESFASE_MS = 5 * 3600_000;
const DIA_MS = 86_400_000;

export interface Rango {
  desde: string;
  hasta: string;
  /** Inicio del intervalo semiabierto: `desde` a las 00:00 de Lima. */
  inicio: Date;
  /** Fin exclusivo: el día siguiente a `hasta`, a las 00:00 de Lima. */
  fin: Date;
  /** Días del rango, en orden. */
  dias: string[];
}

export type ResultadoRango = { ok: true; rango: Rango } | { ok: false; mensaje: string };

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Medianoche UTC del día dado, o null si no es una fecha real. */
function aDia(texto: string): number | null {
  const m = FECHA.exec(texto);
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(a, mes - 1, d);
  const f = new Date(t);
  return f.getUTCFullYear() === a && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d ? t : null;
}

const aTexto = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Fecha de hoy en Lima. */
export function hoyEnLima(ahora: Date): string {
  return aTexto(ahora.getTime() - DESFASE_MS);
}

export function rangoDeFechas(
  entrada: { desde?: string; hasta?: string },
  ahora: Date = new Date(),
): ResultadoRango {
  const hasta = entrada.hasta ?? (entrada.desde ? undefined : hoyEnLima(ahora));
  const tHasta = hasta === undefined ? null : aDia(hasta);
  if (hasta !== undefined && tHasta === null)
    return { ok: false, mensaje: `Fecha inválida: «${hasta}».` };
  const desde = entrada.desde ?? aTexto((tHasta ?? 0) - (DIAS_POR_DEFECTO - 1) * DIA_MS);
  const tDesde = aDia(desde);
  if (tDesde === null) return { ok: false, mensaje: `Fecha inválida: «${desde}».` };
  // Solo «desde»: hasta hoy.
  const tFin = tHasta ?? aDia(hoyEnLima(ahora))!;
  if (tDesde > tFin) return { ok: false, mensaje: '«desde» no puede ser posterior a «hasta».' };
  const n = (tFin - tDesde) / DIA_MS + 1;
  if (n > MAX_DIAS) return { ok: false, mensaje: `El rango no puede pasar de ${MAX_DIAS} días.` };
  const dias = Array.from({ length: n }, (_, i) => aTexto(tDesde + i * DIA_MS));
  return {
    ok: true,
    rango: {
      desde: dias[0]!,
      hasta: dias[n - 1]!,
      inicio: new Date(tDesde + DESFASE_MS),
      fin: new Date(tFin + DIA_MS + DESFASE_MS),
      dias,
    },
  };
}
