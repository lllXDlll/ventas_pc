import type { Metadata } from 'next';
import { ConfiguracionesContenedor } from '@/features/historial/contenedores/historial';

export const metadata: Metadata = { title: 'Mis configuraciones', robots: { index: false } };

/** Configuraciones guardadas, compradas o no (spec historial). */
export default function Configuraciones() {
  return <ConfiguracionesContenedor />;
}
