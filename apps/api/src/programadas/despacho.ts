// Despacho de los Cron Triggers (spec tareas-programadas, design.md D3).
// Cada expresión cron ejecuta solo su tarea. HORARIOS debe coincidir con
// "triggers.crons" de wrangler.jsonc; una prueba lo verifica.

export type NombreTarea = 'expirar' | 'reconciliar' | 'limpiarSesiones';

export const HORARIOS: Readonly<Record<string, NombreTarea>> = Object.freeze({
  '* * * * *': 'expirar', // expiración de reservas, cada minuto
  '*/5 * * * *': 'reconciliar', // reconciliación del disponible, cada 5 minutos
  '0 4 * * *': 'limpiarSesiones', // limpieza de sesiones, diaria a las 04:00 UTC
});

export type Tareas = Record<NombreTarea, () => Promise<void>>;

export interface Registro {
  info(mensaje: string, datos: Record<string, unknown>): void;
  advertencia(mensaje: string, datos: Record<string, unknown>): void;
}

export const registroConsola: Registro = {
  info: (mensaje, datos) => console.log(JSON.stringify({ nivel: 'info', mensaje, ...datos })),
  advertencia: (mensaje, datos) =>
    console.warn(JSON.stringify({ nivel: 'advertencia', mensaje, ...datos })),
};

// Tareas sin lógica (expirar y reconciliar llegan en el Sprint 3). Las de producción, con
// limpiarSesiones real, se arman en worker.ts (aquí no se importa nada del runtime).
export const tareasPorDefecto: Tareas = {
  expirar: async () => {},
  reconciliar: async () => {},
  limpiarSesiones: async () => {},
};

/**
 * Ejecuta la tarea asociada al cron recibido. Devuelve el nombre de la tarea
 * ejecutada, o null si el cron no está registrado (en ese caso no ejecuta nada).
 */
export async function despachar(
  cron: string,
  tareas: Tareas = tareasPorDefecto,
  registro: Registro = registroConsola,
): Promise<NombreTarea | null> {
  const nombre = Object.hasOwn(HORARIOS, cron) ? HORARIOS[cron] : undefined;
  if (!nombre) {
    registro.advertencia('cron no reconocido', { cron });
    return null;
  }
  registro.info('tarea programada', { tarea: nombre, cron });
  await tareas[nombre]();
  return nombre;
}
