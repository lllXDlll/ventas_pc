'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EstadoError } from '@/components/ui/estado';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorApi, mensajeDeError } from '@/lib/api-client';
import { useCarrito } from '@/lib/carrito';
import { FormularioPago, ResumenPago, SinReservaPago } from '../components/pago';
import { usePagar, useReservaActiva, useRestante } from '../hooks/use-carrito';

const nuevaClave = () => crypto.randomUUID();

/** Pantalla de pago de la reserva activa (spec pagos, design D6 del Sprint 4). */
export function PagoContenedor() {
  const router = useRouter();
  const carrito = useCarrito();
  const reserva = useReservaActiva();
  const pago = usePagar();
  const activa = reserva.data ?? null;
  const restante = useRestante(activa?.venceEn);
  // Una clave por intento: se conserva entre reintentos de red y se renueva tras un rechazo.
  const clave = useRef<string>('');
  const [aprobado, setAprobado] = useState(false);

  useEffect(() => {
    if (carrito.data === null) router.replace('/ingresar?volver=%2Fpago');
  }, [carrito.data, router]);

  if (reserva.isError) {
    return (
      <div className="contenedor py-10">
        <EstadoError
          mensaje={mensajeDeError(reserva.error, 'No se pudo cargar tu reserva.')}
          onReintentar={() => void reserva.refetch()}
        />
      </div>
    );
  }
  if (aprobado) {
    return (
      <div className="contenedor py-10">
        <p role="status" className="text-success">
          Pago aprobado. Cargando tu comprobante…
        </p>
      </div>
    );
  }
  if (reserva.isPending || carrito.data === undefined) {
    return (
      <div className="contenedor grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const rechazado = pago.error instanceof ErrorApi && pago.error.codigo === 'PAGO_RECHAZADO';
  const expiro =
    (pago.error instanceof ErrorApi && pago.error.codigo === 'RESERVA_EXPIRADA') ||
    (activa !== null && restante <= 0);

  return (
    <div className="contenedor flex flex-col gap-6 py-6">
      <h1 className="text-3xl">Pago</h1>
      {!activa || expiro ? (
        <SinReservaPago expirada={expiro} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <FormularioPago
            enviando={pago.isPending}
            rechazado={rechazado}
            error={
              pago.isError ? mensajeDeError(pago.error, 'No se pudo completar el pago.') : null
            }
            onPagar={(tarjeta) => {
              if (pago.isPending) return;
              clave.current ||= nuevaClave();
              pago.mutate(
                { reservaId: activa.id, tarjeta, clave: clave.current },
                {
                  onSuccess: (orden) => {
                    setAprobado(true);
                    router.push(`/cuenta/comprobantes/${orden.comprobanteId}?nueva=1`);
                  },
                  onError: (e) => {
                    // Una respuesta de la API cierra el intento; sin respuesta (red) se
                    // reintenta con la misma clave.
                    if (e instanceof ErrorApi && e.estado !== 0) clave.current = '';
                  },
                },
              );
            }}
          />
          <ResumenPago reserva={activa} restanteMs={restante} />
        </div>
      )}
    </div>
  );
}
