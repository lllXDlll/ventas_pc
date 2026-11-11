import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { esNoEncontrado, opcionesProducto } from '@/features/catalogo/api';
import { DetalleContenedor } from '@/features/catalogo/contenedores/detalle';
import { crearQueryClient } from '@/lib/query-client';

/** Detalle de producto precargado en el servidor; un producto inexistente es 404. */
export default async function DetalleProducto({ params }: PageProps<'/catalogo/[id]'>) {
  const { id } = await params;
  const cliente = crearQueryClient();
  try {
    await cliente.fetchQuery(opcionesProducto(id));
  } catch (e) {
    if (esNoEncontrado(e)) notFound();
    // Otro error: el contenedor muestra el estado de error con "Reintentar".
  }
  return (
    <HydrationBoundary state={dehydrate(cliente)}>
      <DetalleContenedor id={id} />
    </HydrationBoundary>
  );
}
