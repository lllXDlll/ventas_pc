import type { Metadata } from 'next';
import { ComprobanteContenedor } from '@/features/historial/contenedores/historial';

export const metadata: Metadata = { title: 'Comprobante', robots: { index: false } };

/** Comprobante imprimible de una compra propia (spec comprobantes). */
export default async function ComprobantePagina({
  params,
  searchParams,
}: PageProps<'/cuenta/comprobantes/[id]'>) {
  const { id } = await params;
  const { nueva } = await searchParams;
  return <ComprobanteContenedor id={id} nueva={nueva === '1'} />;
}
