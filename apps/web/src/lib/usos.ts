// Usos del asistente (spec asistente): el asistente y el armador los muestran igual.
export const USOS = ['GAMING', 'DISENO', 'OFICINA', 'ESTUDIO', 'OTRO'] as const;
export type Uso = (typeof USOS)[number];

export const NOMBRES_USO: Record<Uso, string> = {
  GAMING: 'Gaming',
  DISENO: 'Diseño',
  OFICINA: 'Oficina',
  ESTUDIO: 'Estudio',
  OTRO: 'Otro',
};

export const DESCRIPCION_USO: Record<Uso, string> = {
  GAMING: 'Juegos con buena fluidez: más presupuesto para la tarjeta gráfica.',
  DISENO: 'Edición de fotos, video o 3D: procesador y gráfica equilibrados.',
  OFICINA: 'Documentos, correo y videollamadas: estable y económica.',
  ESTUDIO: 'Clases en línea y tareas: rápida para el día a día.',
  OTRO: 'Un poco de todo: reparto equilibrado.',
};

export const nombreUso = (uso: string | null | undefined) =>
  uso && uso in NOMBRES_USO ? NOMBRES_USO[uso as Uso] : (uso ?? '');
