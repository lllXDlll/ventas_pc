// Preselección de candidatos (design D2 del Sprint 5): pocos por categoría para acotar la
// consulta al modelo, con alias cortos en lugar de UUID.
import type { CategoriaPieza } from '../compatibilidad/motor/tipos';
import { objetivo } from './perfiles';
import { CATEGORIAS_ARMADO, type ProductoAsistente, type Uso } from './tipos';

export interface Candidato {
  alias: string;
  producto: ProductoAsistente;
}

const POR_CERCANIA = 4;

/**
 * Por categoría: los 4 de precio más cercano al objetivo del perfil más el más barato
 * (siempre hay una solución mínima). Solo productos con disponible > 0.
 */
export function preseleccionar(
  productos: readonly ProductoAsistente[],
  presupuestoCent: number,
  uso: Uso,
): Candidato[] {
  const elegidos: ProductoAsistente[] = [];
  for (const categoria of CATEGORIAS_ARMADO) {
    const deCategoria = productos.filter((p) => p.categoria === categoria && p.disponible > 0);
    if (deCategoria.length === 0) continue;
    const meta = objetivo(presupuestoCent, uso, categoria);
    const cercanos = [...deCategoria]
      .sort(
        (a, b) =>
          Math.abs(a.precioCent - meta) - Math.abs(b.precioCent - meta) || a.id.localeCompare(b.id),
      )
      .slice(0, POR_CERCANIA);
    const barato = [...deCategoria].sort(
      (a, b) => a.precioCent - b.precioCent || a.id.localeCompare(b.id),
    )[0]!;
    const conjunto = cercanos.some((p) => p.id === barato.id) ? cercanos : [...cercanos, barato];
    elegidos.push(...conjunto.sort((a, b) => a.precioCent - b.precioCent));
  }
  return elegidos.map((producto, i) => ({ alias: `C${i + 1}`, producto }));
}

export const categoriasDe = (candidatos: readonly Candidato[]): Set<CategoriaPieza> =>
  new Set(candidatos.map((c) => c.producto.categoria));
