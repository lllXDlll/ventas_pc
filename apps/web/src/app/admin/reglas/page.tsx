import type { Metadata } from 'next';
import { ReglasContenedor } from '@/features/admin/contenedores/reglas';

export const metadata: Metadata = { title: 'Reglas de compatibilidad' };

export default function PanelReglas() {
  return <ReglasContenedor />;
}
