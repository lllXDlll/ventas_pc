'use client';

import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { BotonCarrito } from '@/components/layout/interactivos';
import { Button } from '@/components/ui/button';
import { EstadoError, EstadoVacio } from '@/components/ui/estado';
import { Skeleton } from '@/components/ui/skeleton';
import { mensajeDeError } from '@/lib/api-client';
import { useCarrito } from '@/lib/carrito';
import { ListaCarrito, ReservaActiva, ResumenCarrito } from '../components/carrito';
import {
  useCancelarReserva,
  useEditarCarrito,
  useReservaActiva,
  useReservar,
  useRestante,
} from '../hooks/use-carrito';

/** Pantalla del carrito y de la reserva (specs carrito y reservas). */
export function CarritoContenedor() {
  const router = useRouter();
  const carrito = useCarrito();
  const editar = useEditarCarrito();
  const reserva = useReservaActiva();
  const reservar = useReservar();
  const cancelar = useCancelarReserva();
  const activa = reserva.data ?? null;
  const restante = useRestante(activa?.venceEn);

  // Sin sesión: a iniciar sesión y volver al carrito.
  useEffect(() => {
    if (carrito.data === null) router.replace('/ingresar?volver=%2Fcarrito');
  }, [carrito.data, router]);

  if (carrito.isError) {
    return (
      <div className="contenedor py-10">
        <EstadoError
          mensaje={mensajeDeError(carrito.error, 'No se pudo cargar el carrito.')}
          onReintentar={() => void carrito.refetch()}
        />
      </div>
    );
  }
  if (!carrito.data) {
    return (
      <div className="contenedor grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const datos = carrito.data;
  const ocupado = editar.cantidad.isPending || editar.quitar.isPending;
  const error =
    (reservar.isError && mensajeDeError(reservar.error, 'No se pudo reservar.')) ||
    (editar.cantidad.isError && mensajeDeError(editar.cantidad.error)) ||
    (cancelar.isError && mensajeDeError(cancelar.error)) ||
    null;

  return (
    <div className="contenedor flex flex-col gap-6 py-6">
      <h1 className="text-3xl">Carrito</h1>
      {datos.items.length === 0 ? (
        <EstadoVacio
          titulo="Tu carrito está vacío"
          descripcion="Agrega productos del catálogo o un armado compatible."
          accion={
            <Button asChild>
              <Link href="/catalogo">
                <ShoppingCart strokeWidth={1.5} /> Ver catálogo
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ListaCarrito
            items={datos.items}
            ocupado={ocupado || Boolean(activa)}
            onCantidad={(id, cantidad) => editar.cantidad.mutate({ id, cantidad })}
            onQuitar={(id) => editar.quitar.mutate(id)}
          />
          <ResumenCarrito
            total={datos.total}
            cantidad={datos.cantidadProductos}
            error={error || null}
            iniciando={reservar.isPending}
            onIniciar={() => reservar.mutate()}
            reserva={
              activa ? (
                <ReservaActiva
                  reserva={activa}
                  restanteMs={restante}
                  cancelando={cancelar.isPending}
                  onCancelar={() => cancelar.mutate(activa.id)}
                  onReservarDeNuevo={() => reservar.mutate()}
                />
              ) : null
            }
          />
        </div>
      )}
    </div>
  );
}

/** Contador de la cabecera (slot del Header): unidades en el carrito, 0 sin sesión. */
export function CarritoCabecera() {
  const { data } = useCarrito();
  return <BotonCarrito cantidad={data?.cantidadProductos ?? 0} />;
}
