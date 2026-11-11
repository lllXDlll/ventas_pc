// Formatos de presentación (spec sistema-diseno).

const SOLES = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

/** Precio en soles: "1299.00" -> "S/ 1,299.00". */
export function formatoPrecio(precio: string | number): string {
  // es-PE usa "S/" seguido de un espacio no separable; se normaliza a espacio simple.
  return SOLES.format(Number(precio)).replace(/\s/u, ' ');
}

export type NivelStock = 'en-stock' | 'ultimas' | 'agotado';

/** Texto e intención de la insignia de stock (design D10): ≤ 5 son "últimas unidades". */
export function formatoStock(disponible: number): { texto: string; nivel: NivelStock } {
  if (disponible <= 0) return { texto: 'Agotado', nivel: 'agotado' };
  if (disponible === 1) return { texto: 'Última unidad', nivel: 'ultimas' };
  if (disponible <= 5) return { texto: `Últimas ${disponible} unidades`, nivel: 'ultimas' };
  return { texto: 'En stock', nivel: 'en-stock' };
}
