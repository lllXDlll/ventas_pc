import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { connection } from 'next/server';
import { opcionesDestacados } from '@/features/catalogo/api';
import { CategoryGrid, Hero, TrustBar } from '@/features/catalogo/components/inicio';
import { DestacadosContenedor } from '@/features/catalogo/contenedores/inicio';
import { crearQueryClient } from '@/lib/query-client';

/** Inicio: hero, categorías, destacados (precargados en el servidor) y confianza. */
export default async function Inicio() {
  await connection(); // render por petición: el stock debe ser actual
  const cliente = crearQueryClient();
  await cliente.prefetchQuery(opcionesDestacados());
  return (
    <div className="contenedor flex flex-col gap-10 py-6 md:py-8">
      <Hero />
      <CategoryGrid />
      <HydrationBoundary state={dehydrate(cliente)}>
        <DestacadosContenedor />
      </HydrationBoundary>
      <TrustBar />
    </div>
  );
}
