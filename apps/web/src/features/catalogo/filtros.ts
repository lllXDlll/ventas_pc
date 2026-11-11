// Filtros del catálogo en la URL: la URL es la fuente de verdad (design D5 del Sprint 1.5).
import { type CodigoCategoria, esCategoria } from '@/lib/atributos';

export const ORDENES = [
  { valor: 'nombre', etiqueta: 'Nombre (A-Z)' },
  { valor: 'precio_asc', etiqueta: 'Precio: menor a mayor' },
  { valor: 'precio_desc', etiqueta: 'Precio: mayor a menor' },
] as const;
export type Orden = (typeof ORDENES)[number]['valor'];

export interface FiltrosCatalogo {
  categoria?: CodigoCategoria;
  /** Marcas separadas por coma. */
  marca?: string;
  socket?: string;
  precioMin?: string;
  precioMax?: string;
  q?: string;
  orden?: Orden;
  pagina?: string;
}

const CLAVES = [
  'categoria',
  'marca',
  'socket',
  'precioMin',
  'precioMax',
  'q',
  'orden',
  'pagina',
] as const;

type Entrada = URLSearchParams | Record<string, string | string[] | undefined>;

function valor(entrada: Entrada, clave: string): string | undefined {
  const v = entrada instanceof URLSearchParams ? entrada.get(clave) : entrada[clave];
  const texto = Array.isArray(v) ? v[0] : v;
  return texto?.trim() || undefined;
}

/** Filtros normalizados: el mismo objeto en el servidor y en el cliente (misma clave de caché). */
export function leerFiltros(entrada: Entrada): FiltrosCatalogo {
  const f: FiltrosCatalogo = {};
  const categoria = valor(entrada, 'categoria');
  if (esCategoria(categoria)) f.categoria = categoria;
  for (const clave of ['marca', 'socket', 'precioMin', 'precioMax', 'q'] as const) {
    const v = valor(entrada, clave);
    if (v) f[clave] = v;
  }
  const orden = valor(entrada, 'orden');
  if (orden && ORDENES.some((o) => o.valor === orden)) f.orden = orden as Orden;
  const pagina = valor(entrada, 'pagina');
  if (pagina && pagina !== '1' && /^\d+$/.test(pagina)) f.pagina = pagina;
  return f;
}

/** "?a=1&b=2" con los filtros y los cambios; un cambio a undefined quita el filtro. */
export function aConsulta(f: FiltrosCatalogo, cambios: Partial<FiltrosCatalogo> = {}): string {
  const params = new URLSearchParams();
  const todo = { ...f, ...cambios };
  for (const clave of CLAVES) {
    const v = todo[clave];
    if (v) params.set(clave, v);
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}

export const marcasDe = (f: FiltrosCatalogo) => (f.marca ? f.marca.split(',') : []);
