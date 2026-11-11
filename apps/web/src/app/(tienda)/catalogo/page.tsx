import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { opcionesFacetas, opcionesProductos } from '@/features/catalogo/api';
import { CatalogoContenedor } from '@/features/catalogo/contenedores/catalogo';
import { leerFiltros } from '@/features/catalogo/filtros';
import { crearQueryClient } from '@/lib/query-client';

export const metadata: Metadata = { title: 'Catálogo' };

/**
 * Catálogo: se precarga en el servidor con los filtros de la URL (HTML con datos, útil para
 * las pruebas @humo y los buscadores) y el contenedor cliente sigue con la caché.
 */
export default async function Catalogo({ searchParams }: PageProps<'/catalogo'>) {
  const filtros = leerFiltros(await searchParams);
  const cliente = crearQueryClient();
  await Promise.all([
    cliente.prefetchQuery(opcionesProductos(filtros)),
    cliente.prefetchQuery(opcionesFacetas(filtros.categoria)),
  ]);
  return (
    <HydrationBoundary state={dehydrate(cliente)}>
      <Suspense>
        <CatalogoContenedor />
      </Suspense>
    </HydrationBoundary>
  );
}
