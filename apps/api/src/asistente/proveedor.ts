// Puerto del proveedor de IA (spec asistente, design D1 del Sprint 5). El orquestador no
// sabe si responde Claude por AI Gateway o el simulado de las pruebas.
import type { Candidato } from './preseleccion';
import type { Uso } from './tipos';

export interface SolicitudIA {
  /** En soles, con dos decimales. */
  presupuesto: string;
  uso: Uso;
  candidatos: readonly Candidato[];
  /** En el reintento: la respuesta anterior y por qué no sirvió. */
  previa?: { respuesta: unknown; motivos: readonly string[] };
}

/** Por qué no hubo respuesta: el orquestador lo registra y pasa al respaldo. */
export type MotivoFallo =
  | 'IA_DESACTIVADA'
  | 'IA_SIN_CONFIGURAR'
  | 'IA_SIN_AUTORIZACION'
  | 'IA_NO_DISPONIBLE'
  | 'IA_TIMEOUT'
  | 'IA_RECHAZO';

export type ResultadoIA =
  | { tipo: 'respuesta'; respuesta: unknown; tokens?: { entrada: number; salida: number } }
  | { tipo: 'fallo'; motivo: MotivoFallo; detalle?: string };

export interface OpcionesIA {
  timeoutMs: number;
  /** Solo lo usa el proveedor simulado (encabezado x-ia-simulado). */
  escenario?: string;
}

export interface ProveedorIA {
  recomendar(solicitud: SolicitudIA, opciones: OpcionesIA): Promise<ResultadoIA>;
}
