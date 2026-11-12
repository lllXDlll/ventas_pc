import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReporteAsistenteContenedor } from '@/features/admin/contenedores/reportes';

export const metadata: Metadata = { title: 'Reporte del asistente' };

/** El rango vive en la URL (useSearchParams): necesita Suspense. */
export default function PanelReporteAsistente() {
  return (
    <Suspense>
      <ReporteAsistenteContenedor />
    </Suspense>
  );
}
