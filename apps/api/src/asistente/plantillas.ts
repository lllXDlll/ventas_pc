// Explicaciones del respaldo determinístico (spec asistente, HU-30): plantillas por
// categoría y uso con los atributos clave del producto.
import type { CategoriaPieza } from '../compatibilidad/motor/tipos';
import { NOMBRE_USO, type ProductoAsistente, type Uso } from './tipos';

const a = (p: ProductoAsistente, clave: string) => p.atributos[clave];

const FRASE_USO: Record<Uso, string> = {
  GAMING: 'jugar con buena fluidez',
  DISENO: 'trabajar con programas de diseño',
  OFICINA: 'el trabajo de oficina diario',
  ESTUDIO: 'estudiar y hacer tareas sin demoras',
  OTRO: 'un uso general equilibrado',
};

const PLANTILLAS: Record<CategoriaPieza, (p: ProductoAsistente, uso: Uso) => string> = {
  PROCESADOR: (p, uso) =>
    `El ${p.nombre} (socket ${String(a(p, 'socket') ?? '—')}) da el rendimiento necesario para ${FRASE_USO[uso]} sin salirse del presupuesto.`,
  PLACA_MADRE: (p) =>
    `La ${p.nombre} es compatible con el procesador (socket ${String(a(p, 'socket') ?? '—')}) y admite memoria ${String(a(p, 'tipoRam') ?? '')}.`,
  RAM: (p, uso) =>
    `${p.nombre}: memoria ${String(a(p, 'tipoRam') ?? '')} a ${String(a(p, 'velocidadRam') ?? '—')} MHz, suficiente para ${FRASE_USO[uso]}.`,
  TARJETA_GRAFICA: (p, uso) =>
    uso === 'GAMING' || uso === 'DISENO'
      ? `Para ${NOMBRE_USO[uso]} la tarjeta gráfica pesa más en el presupuesto: la ${p.nombre} es la mejor opción que entra en él.`
      : `La ${p.nombre} cubre la salida de video y la aceleración básica que necesita ${NOMBRE_USO[uso]}.`,
  GABINETE: (p) =>
    `El ${p.nombre} admite el formato de la placa y el largo de la tarjeta gráfica elegidas.`,
  ALMACENAMIENTO: (p) =>
    `${p.nombre} (${String(a(p, 'interfaz') ?? 'interfaz compatible')}) guarda el sistema y tus archivos con buena velocidad de carga.`,
  FUENTE: (p) =>
    `La ${p.nombre} entrega ${String(a(p, 'potenciaEntregadaW') ?? '—')} W, con margen sobre el consumo del procesador y la tarjeta gráfica.`,
};

export const explicacionDe = (p: ProductoAsistente, uso: Uso) =>
  PLANTILLAS[p.categoria](p, uso).slice(0, 300);

export const resumenDe = (uso: Uso, totalSoles: string, presupuesto: string) =>
  `Configuración armada para ${NOMBRE_USO[uso]} por S/ ${totalSoles} de un presupuesto de S/ ${presupuesto}, priorizando los componentes que más importan para ese uso.`;
