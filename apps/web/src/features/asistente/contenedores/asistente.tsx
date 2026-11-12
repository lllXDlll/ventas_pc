'use client';

import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorApi, mensajeDeError } from '@/lib/api-client';
import { useAgregarAlCarrito } from '@/lib/carrito';
import { formatoHora } from '@/lib/format';
import { useRedirigirSinSesion } from '@/lib/sesion-requerida';
import {
  ConsultasRestantes,
  EsperaAsistente,
  FormularioAsistente,
  ResultadoAsistente,
} from '../components/asistente';
import { useLimite, useRecomendar } from '../hooks/use-asistente';

/** Mensaje para los errores esperados: presupuesto insuficiente y límite alcanzado. */
function mensaje(error: unknown): string {
  if (error instanceof ErrorApi) {
    if (error.codigo === 'LIMITE_ASISTENTE' && typeof error.detalle?.disponibleDesde === 'string') {
      return `Usaste tus consultas de las últimas 24 horas. Vuelves a tener a las ${formatoHora(error.detalle.disponibleDesde)}.`;
    }
    return error.message;
  }
  return mensajeDeError(error, 'No se pudo obtener la recomendación.');
}

/** Pantalla del asistente (spec asistente, design D11 del Sprint 5). Exige sesión. */
export function AsistenteContenedor() {
  const router = useRouter();
  const estado = useLimite();
  const sinSesion = useRedirigirSinSesion(estado.error);
  const recomendar = useRecomendar();
  const alCarrito = useAgregarAlCarrito();

  return (
    <div className="contenedor flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Asistente de armado</h1>
        <p className="text-text-muted">
          Indica tu presupuesto y para qué usarás la PC. Te recomendamos una configuración completa,
          con stock y validada por nuestro motor de compatibilidad.
        </p>
      </div>
      {sinSesion || estado.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="flex flex-col gap-3 self-start">
            <FormularioAsistente
              enviando={recomendar.isPending}
              error={recomendar.isError ? mensaje(recomendar.error) : null}
              onEnviar={(v) => recomendar.mutate(v)}
            />
            <ConsultasRestantes estado={estado.data} />
          </div>
          <div>
            {recomendar.isPending ? (
              <EsperaAsistente />
            ) : recomendar.data ? (
              <ResultadoAsistente
                r={recomendar.data}
                agregando={alCarrito.isPending}
                errorCarrito={
                  alCarrito.isError ? mensajeDeError(alCarrito.error, 'No se pudo agregar.') : null
                }
                onAgregar={() =>
                  alCarrito.mutate(
                    { configuracionId: recomendar.data.configuracion.id },
                    { onSuccess: () => router.push('/carrito') },
                  )
                }
              />
            ) : (
              <p className="rounded-card border border-dashed border-border p-8 text-center text-sm text-text-muted">
                Tu recomendación aparecerá aquí.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
