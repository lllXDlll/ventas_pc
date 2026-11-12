import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { BotonProximamente } from '@/components/ui/proximamente';
import { Skeleton } from '@/components/ui/skeleton';
import {
  chipsDeAtributos,
  etiquetaAtributo,
  formatoAtributo,
  type CodigoCategoria,
} from '@/lib/atributos';
import { formatoPrecio, formatoStock } from '@/lib/format';
import { ICONO_CATEGORIA } from '@/lib/iconos-categoria';
import { urlImagen } from '@/lib/imagen';
import type { Producto } from '@/lib/tipos';
import { cn } from '@/lib/utils';

// Componentes de presentación del producto, compartidos por catálogo y armador (Sprint 2):
// solo props, sin llamadas a la API
// (spec arquitectura-frontend). El armador del Sprint 2 los reutiliza.

/** Insignia de stock: "En stock", "Últimas N unidades" (≤ 5) o "Agotado". */
export function StockBadge({ disponible }: { disponible: number }) {
  const { texto, nivel } = formatoStock(disponible);
  const variante = nivel === 'en-stock' ? 'exito' : nivel === 'ultimas' ? 'advertencia' : 'peligro';
  return <Badge variante={variante}>{texto}</Badge>;
}

/** Recuadro claro 1:1 con la imagen o, si no hay, el icono de la categoría. */
export function ImagenProducto({
  producto,
  className,
  grande = false,
}: {
  producto: Pick<Producto, 'nombre' | 'imagenUrl'> & { categoria: { codigo: string } };
  className?: string;
  grande?: boolean;
}) {
  const url = urlImagen(producto.imagenUrl);
  const Icono = ICONO_CATEGORIA[producto.categoria.codigo as CodigoCategoria];
  return (
    <div
      className={cn(
        'flex aspect-square w-full items-center justify-center overflow-hidden rounded-card bg-image-bg',
        className,
      )}
    >
      {url ? (
        // Sin next/image: OpenNext está sin optimizador de imágenes (design D9).
        <img
          src={url}
          alt={producto.nombre}
          width={grande ? 640 : 320}
          height={grande ? 640 : 320}
          loading={grande ? 'eager' : 'lazy'}
          className="size-full object-contain p-4"
        />
      ) : Icono ? (
        <Icono
          className={cn('text-image-icon', grande ? 'size-32' : 'size-16')}
          strokeWidth={1.5}
          role="img"
          aria-label={`${producto.nombre} (sin imagen)`}
        />
      ) : null}
    </div>
  );
}

/** Tarjeta de producto (design D10 y documento del Sprint 1.5). */
export function ProductCard({ producto }: { producto: Producto }) {
  const chips = chipsDeAtributos(producto.categoria.codigo, producto.atributos);
  const enlace = `/catalogo/${producto.id}`;
  return (
    <article className="group relative flex flex-col gap-3 rounded-card border border-border bg-card p-3 transition-shadow hover:border-primary hover:shadow-hover">
      <Link href={enlace} tabIndex={-1} aria-hidden="true">
        <ImagenProducto producto={producto} />
      </Link>
      <div className="flex flex-1 flex-col gap-2">
        <span className="text-xs text-text-muted">
          {producto.categoria.nombre}
          {producto.marca ? ` · ${producto.marca}` : ''}
        </span>
        <Link
          href={enlace}
          className="line-clamp-2 min-h-10 text-sm font-medium hover:text-primary-soft"
        >
          {producto.nombre}
        </Link>
        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Atributos clave">
            {chips.map((c) => (
              <li key={c}>
                <Badge>{c}</Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-col items-start gap-2 pt-1">
          <span className="font-display text-2xl font-bold">{formatoPrecio(producto.precio)}</span>
          <StockBadge disponible={producto.disponible} />
        </div>
      </div>
      {/* Visible siempre en móvil; en escritorio, completo al pasar el cursor. */}
      <BotonProximamente
        variante="contorno"
        tamano="sm"
        className="w-full md:opacity-70 md:group-hover:opacity-100 [&>button]:w-full"
      >
        <ShoppingCart strokeWidth={1.5} />
        <span className="md:hidden">Añadir</span>
        <span className="hidden md:inline">Añadir al carrito</span>
      </BotonProximamente>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-3">
      <Skeleton className="aspect-square w-full rounded-card" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-7 w-1/2" />
    </div>
  );
}

/** Rejilla de 2 columnas en móvil, 3 en tableta y 4 en escritorio. */
export function ProductGrid({
  productos,
  cargando = false,
  cantidadEsqueletos = 8,
}: {
  productos?: Producto[];
  cargando?: boolean;
  cantidadEsqueletos?: number;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4"
      aria-busy={cargando || undefined}
    >
      {cargando || !productos
        ? Array.from({ length: cantidadEsqueletos }, (_, i) => <ProductCardSkeleton key={i} />)
        : productos.map((p) => <ProductCard key={p.id} producto={p} />)}
    </div>
  );
}

/** Tabla de especificaciones leída del JSONB de atributos. */
export function SpecsTable({ atributos }: { atributos: Record<string, unknown> }) {
  const filas = Object.entries(atributos);
  if (filas.length === 0) {
    return <p className="text-sm text-text-muted">Sin especificaciones técnicas registradas.</p>;
  }
  return (
    <table className="w-full overflow-hidden rounded-card border border-border text-sm">
      <caption className="sr-only">Especificaciones técnicas</caption>
      <tbody>
        {filas.map(([nombre, valor]) => (
          <tr key={nombre} className="border-b border-border last:border-b-0 even:bg-surface">
            <th scope="row" className="w-1/2 px-4 py-2.5 text-left font-medium text-text-muted">
              {etiquetaAtributo(nombre)}
            </th>
            <td className="px-4 py-2.5">{formatoAtributo(nombre, valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
