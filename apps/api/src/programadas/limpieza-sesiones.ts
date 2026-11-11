// Limpieza diaria de sesiones (spec tareas-programadas, design.md D4 del Sprint 1):
// borra las vencidas y las revocadas hace más de un día. Las revocadas hace menos se
// conservan un día. Lógica pura: el borrado real (Prisma) se inyecta desde worker.ts.
import { type Registro, registroConsola } from './despacho';

const DIA_MS = 86_400_000;

export interface CriterioLimpieza {
  /** Se borran las sesiones con vence_en <= ahora. */
  ahora: Date;
  /** Y las revocadas con revocada_en anterior a esta fecha. */
  revocadasAntesDe: Date;
}

export type BorrarSesiones = (criterio: CriterioLimpieza) => Promise<number>;

/** Devuelve cuántas sesiones borró, o null si falló (el error queda registrado). */
export async function limpiarSesiones(
  borrar: BorrarSesiones,
  registro: Registro = registroConsola,
  ahora: Date = new Date(),
): Promise<number | null> {
  try {
    const borradas = await borrar({ ahora, revocadasAntesDe: new Date(ahora.getTime() - DIA_MS) });
    registro.info('sesiones borradas', { tarea: 'limpiarSesiones', borradas });
    return borradas;
  } catch (error) {
    // El fallo queda registrado y no se propaga: los demás horarios no se ven afectados.
    registro.advertencia('fallo al limpiar sesiones', {
      tarea: 'limpiarSesiones',
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
