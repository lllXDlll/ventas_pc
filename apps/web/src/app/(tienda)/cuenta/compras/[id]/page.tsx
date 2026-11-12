import type { Metadata } from 'next';
import { CompraContenedor } from '@/features/historial/contenedores/historial';

export const metadata: Metadata = { title: 'Detalle de la compra', robots: { index: false } };

/** Detalle de una compra propia (spec historial). */
export default async function Compra({ params }: PageProps<'/cuenta/compras/[id]'>) {
  const { id } = await params;
  return <CompraContenedor id={id} />;
}
