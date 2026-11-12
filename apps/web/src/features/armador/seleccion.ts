// Selección del armador en la URL: ?p=<id>:<cantidad>,…&config=<id> (design D8 del Sprint 2).
// Así sobrevive a recargar, a compartir el enlace y a ir a iniciar sesión y volver.
import type { CodigoCategoria } from '@/lib/atributos';
import type { Item } from './api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pasos del armador, en orden. */
export const PASOS: readonly CodigoCategoria[] = [
  'PROCESADOR',
  'PLACA_MADRE',
  'RAM',
  'TARJETA_GRAFICA',
  'ALMACENAMIENTO',
  'FUENTE',
  'GABINETE',
];

/** RAM y almacenamiento admiten varios productos y cantidad mayor a 1. */
export const MULTIPLES: readonly CodigoCategoria[] = ['RAM', 'ALMACENAMIENTO'];
export const MAX_CANTIDAD = 8;

export function leerSeleccion(p: string | null): Item[] {
  if (!p) return [];
  const vistos = new Set<string>();
  return p
    .split(',')
    .map((par) => {
      const [productoId = '', cantidad = '1'] = par.split(':');
      return { productoId, cantidad: Math.min(MAX_CANTIDAD, Math.max(1, Number(cantidad) || 1)) };
    })
    .filter((i) => UUID.test(i.productoId) && !vistos.has(i.productoId) && vistos.add(i.productoId))
    .slice(0, 30);
}

export function urlArmador(items: Item[], config?: string | null): string {
  const params = new URLSearchParams();
  if (items.length) params.set('p', items.map((i) => `${i.productoId}:${i.cantidad}`).join(','));
  if (config) params.set('config', config);
  const q = params.toString();
  return `/armador${q ? `?${q}` : ''}`;
}
