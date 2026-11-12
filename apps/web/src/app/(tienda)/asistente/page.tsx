import type { Metadata } from 'next';
import { AsistenteContenedor } from '@/features/asistente/contenedores/asistente';

export const metadata: Metadata = { title: 'Asistente de armado', robots: { index: false } };

/** Asistente de IA (spec asistente). Solo de cliente: exige sesión. */
export default function Asistente() {
  return <AsistenteContenedor />;
}
