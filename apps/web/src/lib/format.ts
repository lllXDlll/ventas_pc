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

const FECHA = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
const FECHA_CORTA = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' });

/** Fecha y hora local: "12 nov 2026, 10:30". `corta` omite la hora. */
export function formatoFecha(iso: string, corta = false): string {
  return (corta ? FECHA_CORTA : FECHA).format(new Date(iso));
}

/** Contador de una insignia: "9+" a partir de 10. */
export const formatoContador = (n: number) => (n > 9 ? '9+' : String(n));

const HORA = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Hora local "HH:MM" (cupo del asistente, Sprint 5). */
export const formatoHora = (iso: string) => HORA.format(new Date(iso));
