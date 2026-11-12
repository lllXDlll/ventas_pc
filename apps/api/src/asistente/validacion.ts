// Validación de una recomendación (spec asistente, design D4 del Sprint 5). Pura: la usan la
// respuesta de la IA y el respaldo, con el motor de reglas en memoria.
import { type ConfigRegla, evaluar } from '../compatibilidad/motor/orquestador';
import type { CategoriaPieza, Pieza } from '../compatibilidad/motor/tipos';
import type { ItemRecomendado, ProductoAsistente } from './tipos';
import { CATEGORIAS_ARMADO, UNICAS } from './tipos';

const NOMBRE: Record<CategoriaPieza, string> = {
  PROCESADOR: 'procesador',
  PLACA_MADRE: 'placa madre',
  RAM: 'memoria RAM',
  TARJETA_GRAFICA: 'tarjeta gráfica',
  FUENTE: 'fuente',
  GABINETE: 'gabinete',
  ALMACENAMIENTO: 'almacenamiento',
};

export const aPiezas = (
  items: readonly { producto: ProductoAsistente; cantidad: number }[],
): Pieza[] =>
  items.map(({ producto, cantidad }) => ({
    id: producto.id,
    nombre: producto.nombre,
    categoria: producto.categoria,
    atributos: producto.atributos,
    cantidad,
  }));

/**
 * Motivos por los que una lista de piezas no sirve como recomendación; vacío si sirve:
 * completa, cantidades dentro del disponible, total dentro del presupuesto y sin rechazos.
 */
export function motivosDe(
  items: readonly ItemRecomendado[],
  presupuestoCent: number,
  reglas: readonly ConfigRegla[],
): string[] {
  const motivos: string[] = [];
  for (const categoria of CATEGORIAS_ARMADO) {
    const n = items.filter((i) => i.producto.categoria === categoria).length;
    const unica = UNICAS.includes(categoria);
    if (n === 0) motivos.push(`Falta ${NOMBRE[categoria]}.`);
    else if (unica && n > 1) motivos.push(`Debe haber solo un(a) ${NOMBRE[categoria]}.`);
  }
  const ids = new Set<string>();
  for (const { producto, cantidad } of items) {
    if (ids.has(producto.id)) motivos.push(`«${producto.nombre}» aparece repetido.`);
    ids.add(producto.id);
    if (UNICAS.includes(producto.categoria) && cantidad !== 1) {
      motivos.push(`De «${producto.nombre}» va una sola unidad.`);
    }
    if (cantidad > producto.disponible) {
      motivos.push(`De «${producto.nombre}» quedan ${producto.disponible} unidades.`);
    }
  }
  const total = items.reduce((s, i) => s + i.producto.precioCent * i.cantidad, 0);
  if (total > presupuestoCent) {
    motivos.push(
      `El total (S/ ${(total / 100).toFixed(2)}) supera el presupuesto (S/ ${(presupuestoCent / 100).toFixed(2)}).`,
    );
  }
  for (const r of evaluar(aPiezas(items), reglas).rechazos) motivos.push(r.mensaje);
  return motivos;
}

export const totalCent = (items: readonly { producto: ProductoAsistente; cantidad: number }[]) =>
  items.reduce((s, i) => s + i.producto.precioCent * i.cantidad, 0);
