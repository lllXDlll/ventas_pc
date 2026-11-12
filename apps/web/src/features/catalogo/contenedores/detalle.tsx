'use client';

import { Wrench } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EstadoError } from '@/components/ui/estado';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorApi, mensajeDeError } from '@/lib/api-client';
import { formatoPrecio } from '@/lib/format';
import { Breadcrumbs } from '../components/filtros';
import { ImagenProducto, SpecsTable, StockBadge } from '@/components/producto/producto';
import { useProducto } from '../hooks/use-catalogo';
import { AgregarAlCarrito } from './agregar-carrito';

/** Detalle de producto: un agotado se muestra como tal; uno inexistente, 404. */
export function DetalleContenedor({ id }: { id: string }) {
  const { data: producto, error, isError, refetch } = useProducto(id);

  if (isError) {
    if (error instanceof ErrorApi && error.estado === 404) notFound();
    return (
      <div className="contenedor py-10">
        <EstadoError
          mensaje={mensajeDeError(error, 'No se pudo cargar el producto.')}
          onReintentar={() => void refetch()}
        />
      </div>
    );
  }
  if (!producto) {
    return (
      <div className="contenedor grid gap-8 py-8 md:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-card" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }
  const categoria = producto.categoria;
  return (
    <div className="contenedor flex flex-col gap-6 py-6">
      <Breadcrumbs
        items={[
          { texto: 'Inicio', href: '/' },
          { texto: 'Catálogo', href: '/catalogo' },
          { texto: categoria.nombre, href: `/catalogo?categoria=${categoria.codigo}` },
          { texto: producto.nombre },
        ]}
      />
      <div className="grid gap-8 md:grid-cols-2">
        <ImagenProducto
          producto={producto}
          grande
          className="mx-auto max-w-md md:sticky md:top-36 md:self-start"
        />
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text-muted">
              {categoria.nombre}
              {producto.marca ? ` · ${producto.marca}` : ''} ·{' '}
              {producto.tipo === 'EQUIPO' ? 'Equipo armado' : 'Componente'}
            </p>
            <h1 className="text-2xl md:text-3xl">{producto.nombre}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-3xl font-bold">
              {formatoPrecio(producto.precio)}
            </span>
            <StockBadge disponible={producto.disponible} />
          </div>
          {producto.agotado && (
            <p className="text-sm text-text-muted">Por ahora no hay unidades disponibles.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <AgregarAlCarrito
              productoId={producto.id}
              nombre={producto.nombre}
              agotado={producto.agotado}
              tamano="lg"
            />
            {/* Sprint 2: abre el armador con este producto elegido (equipos armados no). */}
            {categoria.codigo !== 'EQUIPO_ARMADO' && (
              <Button asChild variante="contorno" tamano="lg">
                <Link href={`/armador?p=${producto.id}:1`}>
                  <Wrench strokeWidth={1.5} /> Usar en mi armado
                </Link>
              </Button>
            )}
          </div>
          <section className="flex flex-col gap-3">
            <h2 className="text-xl">Especificaciones técnicas</h2>
            <SpecsTable atributos={producto.atributos} />
          </section>
        </div>
      </div>
    </div>
  );
}
