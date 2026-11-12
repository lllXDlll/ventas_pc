// Armador determinístico por perfil de uso (spec asistente, HU-30, design D5 del Sprint 5):
// búsqueda en profundidad con poda por presupuesto y por el motor de reglas en memoria.
import { type ConfigRegla, evaluar } from '../compatibilidad/motor/orquestador';
import type { CategoriaPieza } from '../compatibilidad/motor/tipos';
import { objetivo } from './perfiles';
import { explicacionDe } from './plantillas';
import { CATEGORIAS_ARMADO, type ItemRecomendado, type ProductoAsistente, type Uso } from './tipos';
import { aPiezas } from './validacion';

export const MAX_NODOS = 5000;

interface Busqueda {
  ordenar: (categoria: CategoriaPieza, productos: ProductoAsistente[]) => ProductoAsistente[];
  presupuestoCent: number;
  /** Con `true` sigue buscando el más barato (rama y cota); si no, devuelve el primero. */
  minimizar: boolean;
}

function buscar(
  productos: readonly ProductoAsistente[],
  reglas: readonly ConfigRegla[],
  { ordenar, presupuestoCent, minimizar }: Busqueda,
): { elegidos: ProductoAsistente[] | null; nodos: number } {
  const porCategoria = CATEGORIAS_ARMADO.map((c) =>
    ordenar(
      c,
      productos.filter((p) => p.categoria === c && p.disponible > 0),
    ),
  );
  if (porCategoria.some((l) => l.length === 0)) return { elegidos: null, nodos: 0 };
  // Suma de los mínimos de las categorías que faltan desde la posición i.
  const minimos = porCategoria.map((l) => Math.min(...l.map((p) => p.precioCent)));
  const restante = minimos.map((_, i) => minimos.slice(i).reduce((s, m) => s + m, 0));

  let mejor: ProductoAsistente[] | null = null;
  let cota = presupuestoCent;
  let nodos = 0;
  const parcial: ProductoAsistente[] = [];

  const paso = (i: number, costo: number): boolean => {
    if (i === porCategoria.length) {
      mejor = [...parcial];
      cota = costo - 1; // en minimizar, la próxima debe ser más barata
      return !minimizar;
    }
    for (const p of porCategoria[i]!) {
      if (++nodos > MAX_NODOS) return true;
      const nuevo = costo + p.precioCent;
      if (nuevo + (restante[i + 1] ?? 0) > cota) continue;
      parcial.push(p);
      const compatible = evaluar(
        aPiezas(parcial.map((x) => ({ producto: x, cantidad: 1 }))),
        reglas,
      ).compatible;
      if (compatible && paso(i + 1, nuevo)) {
        parcial.pop();
        return true;
      }
      parcial.pop();
    }
    return false;
  };
  paso(0, 0);
  return { elegidos: mejor, nodos };
}

/**
 * Configuración completa y compatible para el uso: en cada categoría prefiere el producto
 * más caro que no supera el objetivo del perfil, luego los de precio más cercano.
 */
export function armar(
  productos: readonly ProductoAsistente[],
  presupuestoCent: number,
  uso: Uso,
  reglas: readonly ConfigRegla[],
): { items: ItemRecomendado[]; nodos: number } | null {
  const ordenar = (c: CategoriaPieza, lista: ProductoAsistente[]) => {
    const meta = objetivo(presupuestoCent, uso, c);
    const clave = (p: ProductoAsistente) =>
      p.precioCent <= meta ? meta - p.precioCent : 1_000_000_000 + (p.precioCent - meta);
    return [...lista].sort((a, b) => clave(a) - clave(b) || a.id.localeCompare(b.id));
  };
  const { elegidos, nodos } = buscar(productos, reglas, {
    ordenar,
    presupuestoCent,
    minimizar: false,
  });
  if (!elegidos) return null;
  return {
    nodos,
    items: (elegidos as ProductoAsistente[]).map((producto) => ({
      producto,
      cantidad: 1,
      explicacion: explicacionDe(producto, uso),
    })),
  };
}

/** La configuración completa y compatible más barata, o null si no hay ninguna. */
export function masBarata(
  productos: readonly ProductoAsistente[],
  reglas: readonly ConfigRegla[],
  uso: Uso = 'OTRO',
): ItemRecomendado[] | null {
  const ordenar = (_c: CategoriaPieza, lista: ProductoAsistente[]) =>
    [...lista].sort((a, b) => a.precioCent - b.precioCent || a.id.localeCompare(b.id));
  const { elegidos } = buscar(productos, reglas, {
    ordenar,
    presupuestoCent: Number.MAX_SAFE_INTEGER,
    minimizar: true,
  });
  return elegidos
    ? (elegidos as ProductoAsistente[]).map((producto) => ({
        producto,
        cantidad: 1,
        explicacion: explicacionDe(producto, uso),
      }))
    : null;
}

/** Costo en céntimos de la configuración completa y compatible más barata, o null. */
export function minimo(
  productos: readonly ProductoAsistente[],
  reglas: readonly ConfigRegla[],
): number | null {
  const items = masBarata(productos, reglas);
  return items ? items.reduce((s, i) => s + i.producto.precioCent, 0) : null;
}
