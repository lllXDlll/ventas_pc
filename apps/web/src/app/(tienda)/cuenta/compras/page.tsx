import type { Metadata } from 'next';
import { ComprasContenedor } from '@/features/historial/contenedores/historial';

export const metadata: Metadata = { title: 'Mis compras', robots: { index: false } };

/** Historial de compras (spec historial). Solo de cliente: exige sesión. */
export default function Compras() {
  return <ComprasContenedor />;
}
