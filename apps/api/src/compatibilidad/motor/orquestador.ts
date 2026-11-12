// Orquestador del motor (design D1 y D2 del Sprint 2): ejecuta las reglas activas en orden
// fijo con sus parámetros (por defecto + base de datos) y junta los rechazos.
import { type CodigoRegla, PARAMETROS_POR_DEFECTO } from './parametros';
import { REGLAS } from './reglas';
import { agrupar, type Pieza, type Rechazo } from './tipos';

/** Fila de reglas_compatibilidad. */
export interface ConfigRegla {
  codigo: CodigoRegla;
  activa: boolean;
  parametros: Record<string, unknown>;
}

export interface Resultado {
  compatible: boolean;
  rechazos: Rechazo[];
}

function parametrosDe(codigo: CodigoRegla, fila: ConfigRegla | undefined) {
  const numericos = Object.fromEntries(
    Object.entries(fila?.parametros ?? {}).filter(([, v]) => typeof v === 'number'),
  ) as Record<string, number>;
  return { ...PARAMETROS_POR_DEFECTO[codigo], ...numericos };
}

/**
 * Una regla sin fila en la base se considera activa con sus parámetros por defecto: una
 * base sin semilla no se vuelve permisiva en silencio.
 */
export function evaluar(piezas: Pieza[], configuracion: readonly ConfigRegla[]): Resultado {
  const porCodigo = new Map(configuracion.map((c) => [c.codigo, c]));
  const evaluable = agrupar(piezas);
  const rechazos = REGLAS.flatMap((regla) => {
    const fila = porCodigo.get(regla.codigo);
    if (fila && !fila.activa) return [];
    return regla.validar(evaluable, parametrosDe(regla.codigo, fila));
  });
  return { compatible: rechazos.length === 0, rechazos };
}
