'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { EstadoError, EstadoVacio } from '@/components/ui/estado';
import { Skeleton } from '@/components/ui/skeleton';
import { mensajeDeError } from '@/lib/api-client';
import { NOMBRES_CATEGORIA } from '@/lib/atributos';
import { POR_PAGINA } from '../api';
import {
  Breadcrumbs,
  FilterChips,
  FiltrosSidebar,
  Pagination,
  SortSelect,
} from '../components/filtros';
import { ProductGrid } from '../components/producto';
import { aConsulta, type FiltrosCatalogo, leerFiltros } from '../filtros';
import { useFacetas, useProductos } from '../hooks/use-catalogo';

/**
 * Cambia los filtros sin volver a renderizar en el servidor: Next sincroniza
 * useSearchParams con la History API y TanStack Query trae los datos desde el navegador
 * (design D5 del Sprint 1.5).
 */
function navegar(url: string) {
  window.history.replaceState(null, '', url);
}

/** Listado del catálogo: une la URL (filtros), los datos y los componentes de presentación. */
export function CatalogoContenedor() {
  const filtros = leerFiltros(useSearchParams());
  const productos = useProductos(filtros);
  const facetas = useFacetas(filtros.categoria);

  // Cambiar un filtro vuelve a la página 1. Un cambio de categoría quita marca y socket,
  // que dependen de ella.
  const aplicar = (cambios: Partial<FiltrosCatalogo>) => {
    const base =
      'categoria' in cambios ? { ...filtros, marca: undefined, socket: undefined } : filtros;
    navegar(`/catalogo${aConsulta(base, { ...cambios, pagina: undefined })}`);
  };
  const limpiar = () => navegar('/catalogo');

  const titulo = filtros.categoria ? NOMBRES_CATEGORIA[filtros.categoria] : 'Catálogo';
  const datos = productos.data;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / (datos.porPagina || POR_PAGINA))) : 1;
  const sidebar = <FiltrosSidebar filtros={filtros} facetas={facetas.data} onCambiar={aplicar} />;

  return (
    <div className="contenedor flex flex-col gap-6 py-6">
      <Breadcrumbs
        items={[
          { texto: 'Inicio', href: '/' },
          ...(filtros.categoria
            ? [{ texto: 'Catálogo', href: '/catalogo' }, { texto: titulo }]
            : [{ texto: 'Catálogo' }]),
        ]}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Catálogo</h1>
          {filtros.categoria && <p className="text-text-muted">{titulo}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variante="contorno" className="lg:hidden">
                <SlidersHorizontal strokeWidth={1.5} /> Filtros
              </Button>
            </DialogTrigger>
            <DialogContent lado="izquierda" aria-describedby={undefined}>
              <DialogTitle className="mb-4">Filtros</DialogTitle>
              {sidebar}
            </DialogContent>
          </Dialog>
          <SortSelect orden={filtros.orden} onCambiar={(orden) => aplicar({ orden })} />
        </div>
      </div>
      <FilterChips filtros={filtros} onQuitar={aplicar} onLimpiar={limpiar} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside aria-label="Filtros" className="hidden lg:block">
          {sidebar}
        </aside>
        <section aria-label="Resultados" className="flex min-w-0 flex-col gap-4">
          {productos.isError ? (
            <EstadoError
              mensaje={mensajeDeError(productos.error, 'No se pudo cargar el catálogo.')}
              onReintentar={() => void productos.refetch()}
            />
          ) : !datos ? (
            <>
              <Skeleton className="h-5 w-48" />
              <ProductGrid cargando />
            </>
          ) : datos.total === 0 ? (
            <EstadoVacio
              titulo="No hay productos con estos filtros"
              descripcion="Prueba con otra categoría, marca o rango de precio."
              accion={
                <Button variante="contorno" onClick={limpiar}>
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <>
              <p className="text-sm text-text-muted" aria-live="polite">
                {datos.total} productos disponibles
              </p>
              <ProductGrid productos={datos.productos} />
              <Pagination filtros={filtros} pagina={datos.pagina} paginas={paginas} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
