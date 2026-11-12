import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReporteVentasContenedor } from '@/features/admin/contenedores/reportes';

export const metadata: Metadata = { title: 'Reporte de ventas' };

/** El rango vive en la URL (useSearchParams): necesita Suspense. */
export default function PanelReporteVentas() {
  return (
    <Suspense>
      <ReporteVentasContenedor />
    </Suspense>
  );
}
