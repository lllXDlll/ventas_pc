'use client';

import { Clock, CreditCard, Lock } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { formatoPrecio } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DatosTarjeta, VistaReserva } from '../api';
import { formatoCvv, formatoNumeroTarjeta, formatoVencimiento, TARJETAS_PRUEBA } from '../tarjeta';
import { mmss } from './carrito';

// Pantalla de pago (spec pagos): presentación pura, los datos llegan por props.

/** Formulario de tarjeta no controlado: el formato se aplica sobre el propio input. */
export function FormularioPago({
  enviando,
  error,
  rechazado,
  onPagar,
}: {
  enviando: boolean;
  error: string | null;
  rechazado: boolean;
  onPagar: (tarjeta: DatosTarjeta) => void;
}) {
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando) return; // doble clic: una sola petición
    const datos = new FormData(e.currentTarget);
    const texto = (n: string) => String(datos.get(n) ?? '').trim();
    onPagar({
      numero: texto('numero'),
      vencimiento: texto('vencimiento'),
      cvv: texto('cvv'),
      titular: texto('titular'),
    });
  };
  const formatear =
    (f: (v: string, borrando: boolean) => string) => (e: FormEvent<HTMLInputElement>) => {
      const borrando = (e.nativeEvent as InputEvent).inputType?.startsWith('delete') ?? false;
      e.currentTarget.value = f(e.currentTarget.value, borrando);
    };

  return (
    <form
      onSubmit={enviar}
      aria-label="Datos de pago"
      className="flex flex-col gap-4 rounded-card border border-border bg-card p-5"
    >
      <h2 className="flex items-center gap-2 text-xl">
        <CreditCard className="size-5 text-primary-soft" strokeWidth={1.5} aria-hidden="true" />
        Tarjeta
      </h2>
      <div className="rounded-control border border-border bg-surface p-3 text-sm">
        <p className="font-medium">Pago simulado: usa una tarjeta de prueba</p>
        <ul className="mt-1 text-text-muted">
          {TARJETAS_PRUEBA.map((t) => (
            <li key={t.numero}>
              <span className="font-mono">{t.numero}</span> · {t.resultado}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-text-muted">
          Cualquier vencimiento futuro y CVV de 3 dígitos.
        </p>
      </div>
      <FormField etiqueta="Número de tarjeta">
        <Input
          name="numero"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          required
          maxLength={23}
          onInput={formatear((v) => formatoNumeroTarjeta(v))}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField etiqueta="Vencimiento (MM/AA)">
          <Input
            name="vencimiento"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="12/30"
            required
            maxLength={5}
            onInput={formatear(formatoVencimiento)}
          />
        </FormField>
        <FormField etiqueta="CVV">
          <Input
            name="cvv"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            required
            maxLength={4}
            onInput={formatear((v) => formatoCvv(v))}
          />
        </FormField>
      </div>
      <FormField etiqueta="Titular">
        <Input
          name="titular"
          autoComplete="cc-name"
          placeholder="Como figura en la tarjeta"
          required
        />
      </FormField>
      {error && (
        <p
          role="alert"
          className={cn(
            'rounded-control border p-3 text-sm',
            rechazado ? 'border-warning/50 text-warning' : 'border-danger/40 text-danger',
          )}
        >
          {error}
        </p>
      )}
      <Button type="submit" tamano="lg" disabled={enviando} aria-disabled={enviando}>
        <Lock strokeWidth={1.5} /> {enviando ? 'Procesando pago…' : 'Pagar'}
      </Button>
    </form>
  );
}

/** Resumen de la reserva que se paga, con su cuenta regresiva. */
export function ResumenPago({
  reserva,
  restanteMs,
}: {
  reserva: VistaReserva;
  restanteMs: number;
}) {
  return (
    <aside
      aria-label="Resumen de la compra"
      className="flex flex-col gap-4 self-start rounded-card border border-border bg-card p-5"
    >
      <h2 className="text-xl">Tu compra</h2>
      <p className="flex items-center gap-2 text-sm">
        <Clock className="size-4 text-primary-soft" strokeWidth={1.5} aria-hidden="true" />
        Stock reservado por
        <span className="font-display text-xl font-bold" aria-label="Tiempo restante">
          {mmss(restanteMs)}
        </span>
      </p>
      <ul className="flex flex-col gap-2 text-sm" aria-label="Productos reservados">
        {reserva.items.map((i) => (
          <li key={i.producto.id} className="flex justify-between gap-3">
            <span className="min-w-0">
              {i.cantidad > 1 ? `${i.cantidad} × ` : ''}
              {i.producto.nombre}
            </span>
            <span className="shrink-0">
              {formatoPrecio(Number(i.producto.precio) * i.cantidad)}
            </span>
          </li>
        ))}
      </ul>
      <p className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-sm text-text-muted">Total</span>
        <span className="font-display text-2xl font-bold">{formatoPrecio(reserva.total)}</span>
      </p>
    </aside>
  );
}

/** Sin reserva vigente: volver al carrito para reservar de nuevo. */
export function SinReservaPago({ expirada }: { expirada: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-card border border-border bg-card p-6">
      <h2 className="text-xl">{expirada ? 'Tu reserva expiró' : 'No tienes una reserva activa'}</h2>
      <p className="text-sm text-text-muted">
        {expirada
          ? 'El stock volvió a estar disponible. Inicia la compra de nuevo desde tu carrito.'
          : 'Inicia la compra desde tu carrito para reservar el stock y pagar.'}
      </p>
      <Button asChild>
        <Link href="/carrito">Volver al carrito</Link>
      </Button>
    </div>
  );
}
