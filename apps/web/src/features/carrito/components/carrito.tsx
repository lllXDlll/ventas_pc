'use client';

import { AlertTriangle, Clock, Minus, Plus, Trash2, Wrench } from 'lucide-react';
import Link from 'next/link';
import { ImagenProducto } from '@/components/producto/producto';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BotonProximamente } from '@/components/ui/proximamente';
import type { ItemCarrito } from '@/lib/carrito';
import { formatoPrecio } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { VistaReserva } from '../api';

// Componentes de presentación del carrito y la reserva (specs carrito y reservas).

const MAX = 8;

function Cantidad({
  valor,
  nombre,
  ocupado,
  onCambiar,
}: {
  valor: number;
  nombre: string;
  ocupado: boolean;
  onCambiar: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${nombre}`}>
      <Button
        type="button"
        tamano="icono"
        variante="fantasma"
        className="size-8"
        aria-label="Quitar una"
        disabled={ocupado || valor <= 1}
        onClick={() => onCambiar(valor - 1)}
      >
        <Minus strokeWidth={1.5} />
      </Button>
      <span className="w-6 text-center text-sm">{valor}</span>
      <Button
        type="button"
        tamano="icono"
        variante="fantasma"
        className="size-8"
        aria-label="Agregar una"
        disabled={ocupado || valor >= MAX}
        onClick={() => onCambiar(valor + 1)}
      >
        <Plus strokeWidth={1.5} />
      </Button>
    </div>
  );
}

export function ListaCarrito({
  items,
  ocupado,
  onCantidad,
  onQuitar,
}: {
  items: ItemCarrito[];
  ocupado: boolean;
  onCantidad: (id: string, cantidad: number) => void;
  onQuitar: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Productos del carrito">
      {items.map((item) => {
        const principal = item.producto ?? item.configuracion?.productos[0]?.producto;
        const nombre = item.producto?.nombre ?? 'Configuración armada';
        return (
          <li
            key={item.id}
            className={cn(
              'flex flex-wrap items-center gap-4 rounded-card border border-border bg-card p-4',
              item.sinDisponible && 'border-warning/60',
            )}
          >
            {principal ? (
              <ImagenProducto producto={principal} className="size-20 shrink-0" />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {item.tipo === 'CONFIGURACION' && (
                  <Wrench className="mr-1 inline size-4 text-primary-soft" strokeWidth={1.5} />
                )}
                {nombre}
              </p>
              {item.configuracion && (
                <ul className="mt-1 text-xs text-text-muted">
                  {item.configuracion.productos.map((c) => (
                    <li key={c.producto.id}>
                      {c.cantidad > 1 ? `${c.cantidad} × ` : ''}
                      {c.producto.nombre}
                    </li>
                  ))}
                </ul>
              )}
              {item.sinDisponible && (
                <Badge variante="advertencia" className="mt-2">
                  <AlertTriangle strokeWidth={1.5} /> Sin stock suficiente
                </Badge>
              )}
            </div>
            <Cantidad
              valor={item.cantidad}
              nombre={nombre}
              ocupado={ocupado}
              onCambiar={(n) => onCantidad(item.id, n)}
            />
            <span className="w-28 text-right font-display text-lg font-bold">
              {formatoPrecio(item.subtotal)}
            </span>
            <Button
              type="button"
              tamano="icono"
              variante="fantasma"
              aria-label={`Quitar ${nombre}`}
              disabled={ocupado}
              onClick={() => onQuitar(item.id)}
            >
              <Trash2 strokeWidth={1.5} />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Reserva activa: cuenta regresiva, "Pagar" (Sprint 4) y cancelar. */
export function ReservaActiva({
  reserva,
  restanteMs,
  cancelando,
  onCancelar,
  onReservarDeNuevo,
}: {
  reserva: VistaReserva;
  restanteMs: number;
  cancelando: boolean;
  onCancelar: () => void;
  onReservarDeNuevo: () => void;
}) {
  const vencida = restanteMs <= 0;
  return (
    <section
      aria-label="Tu reserva"
      className={cn(
        'flex flex-col gap-3 rounded-card border bg-surface p-4',
        vencida ? 'border-danger/50' : 'border-primary/60',
      )}
    >
      {vencida ? (
        <>
          <p role="alert" className="text-sm text-danger">
            Tu reserva expiró y el stock volvió a estar disponible.
          </p>
          <Button type="button" onClick={onReservarDeNuevo}>
            Reservar de nuevo
          </Button>
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm">
            <Clock className="size-4 text-primary-soft" strokeWidth={1.5} aria-hidden="true" />
            Stock reservado por
            <span className="font-display text-xl font-bold" aria-label="Tiempo restante">
              {mmss(restanteMs)}
            </span>
          </p>
          <p className="text-xs text-text-muted">Total reservado: {formatoPrecio(reserva.total)}</p>
          <BotonProximamente className="[&>button]:w-full">Pagar</BotonProximamente>
          <Button type="button" variante="fantasma" disabled={cancelando} onClick={onCancelar}>
            Cancelar reserva
          </Button>
        </>
      )}
    </section>
  );
}

export function ResumenCarrito({
  total,
  cantidad,
  reserva,
  error,
  iniciando,
  onIniciar,
}: {
  total: string;
  cantidad: number;
  reserva: React.ReactNode;
  error: string | null;
  iniciando: boolean;
  onIniciar: () => void;
}) {
  return (
    <aside
      aria-label="Resumen del carrito"
      className="flex flex-col gap-4 self-start rounded-card border border-border bg-card p-5 lg:sticky lg:top-36"
    >
      <h2 className="text-xl">Resumen</h2>
      <p className="flex items-baseline justify-between">
        <span className="text-sm text-text-muted">
          {cantidad} {cantidad === 1 ? 'producto' : 'productos'}
        </span>
        <span className="font-display text-2xl font-bold">{formatoPrecio(total)}</span>
      </p>
      {error && (
        <p role="alert" className="rounded-control border border-danger/40 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {reserva ?? (
        <Button type="button" tamano="lg" disabled={iniciando} onClick={onIniciar}>
          {iniciando ? 'Reservando…' : 'Iniciar compra'}
        </Button>
      )}
      <p className="text-xs text-text-muted">
        Al iniciar la compra reservamos el stock por 10 minutos mientras pagas.
      </p>
      <Link href="/catalogo" className="text-center text-sm text-primary-soft underline">
        Seguir comprando
      </Link>
    </aside>
  );
}
