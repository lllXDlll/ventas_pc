'use client';

import { Check, ShoppingCart } from 'lucide-react';
import { Button, type PropsBoton } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/api-client';
import { useAgregarAlCarrito } from '@/lib/carrito';
import { cn } from '@/lib/utils';

/** "Añadir al carrito" (spec carrito): sin sesión, pide iniciar sesión y vuelve aquí. */
export function AgregarAlCarrito({
  productoId,
  nombre,
  agotado = false,
  compacto = false,
  tamano,
  className,
}: {
  productoId: string;
  nombre: string;
  agotado?: boolean;
  compacto?: boolean;
  tamano?: PropsBoton['tamano'];
  className?: string;
}) {
  const agregar = useAgregarAlCarrito();
  const listo = agregar.isSuccess;
  return (
    <span className={cn('inline-flex flex-col gap-1', className)}>
      <Button
        type="button"
        tamano={tamano}
        variante={compacto ? 'contorno' : 'primario'}
        disabled={agotado || agregar.isPending}
        aria-label={`${listo ? 'Añadido al carrito' : 'Añadir al carrito'}: ${nombre}`}
        onClick={() => agregar.mutate({ productoId })}
        className="w-full"
      >
        {listo ? <Check strokeWidth={1.5} /> : <ShoppingCart strokeWidth={1.5} />}
        {compacto ? (
          <>
            <span className="md:hidden">{listo ? 'Añadido' : 'Añadir'}</span>
            <span className="hidden md:inline">{listo ? 'Añadido' : 'Añadir al carrito'}</span>
          </>
        ) : listo ? (
          'Añadido al carrito'
        ) : (
          'Añadir al carrito'
        )}
      </Button>
      <span aria-live="polite" className="text-xs text-text-muted empty:hidden">
        {agregar.isError && !agregar.isPending
          ? mensajeDeError(agregar.error, 'No se pudo agregar.').replace(/^No autenticado.*$/, '')
          : ''}
      </span>
    </span>
  );
}
