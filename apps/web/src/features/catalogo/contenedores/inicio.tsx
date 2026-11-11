'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { EstadoError, EstadoVacio } from '@/components/ui/estado';
import { MegaMenu } from '@/components/layout/mega-menu';
import { mensajeDeError } from '@/lib/api-client';
import { ProductGrid } from '../components/producto';
import { useDestacados, useFacetas } from '../hooks/use-catalogo';

/** 8 productos destacados del inicio, con sus estados de carga, vacío y error. */
export function DestacadosContenedor() {
  const { data, isError, error, refetch } = useDestacados();
  return (
    <section aria-labelledby="titulo-destacados" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <h2 id="titulo-destacados" className="text-2xl">
          Destacados
        </h2>
        <Link href="/catalogo" className="inline-flex items-center gap-1 text-sm text-primary-soft">
          Ver todo <ArrowRight className="size-4" strokeWidth={1.5} />
        </Link>
      </div>
      {isError ? (
        <EstadoError
          mensaje={mensajeDeError(error, 'No se pudieron cargar los destacados.')}
          onReintentar={() => void refetch()}
        />
      ) : data && data.productos.length === 0 ? (
        <EstadoVacio titulo="Aún no hay productos disponibles" />
      ) : (
        <ProductGrid productos={data?.productos} cargando={!data} />
      )}
    </section>
  );
}

/** Mega menú con la columna de marcas leída de las facetas (spec catalogo). */
export function MegaMenuContenedor() {
  const { data } = useFacetas();
  return <MegaMenu marcas={data?.marcas.map((m) => m.valor) ?? []} />;
}
