'use client';

import { X } from 'lucide-react';
import { Dialog as Primitivo } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Molécula Dialog sobre Radix (foco atrapado, Esc cierra y devuelve el foco), de shadcn/ui.
export const Dialog = Primitivo.Root;
export const DialogTrigger = Primitivo.Trigger;
export const DialogClose = Primitivo.Close;

export function DialogContent({
  className,
  children,
  lado,
  ...props
}: ComponentProps<typeof Primitivo.Content> & {
  /** "izquierda" lo convierte en un panel lateral (menú móvil). */
  lado?: 'izquierda';
}) {
  return (
    <Primitivo.Portal>
      <Primitivo.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Primitivo.Content
        className={cn(
          'fixed z-50 border border-border bg-card text-text shadow-xl',
          lado === 'izquierda'
            ? 'inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto p-5 data-[state=open]:animate-in data-[state=open]:slide-in-from-left'
            : 'top-1/2 left-1/2 w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-modal p-6 data-[state=open]:animate-in data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
        <Primitivo.Close
          className="absolute top-4 right-4 rounded-control p-1 text-text-muted hover:text-text"
          aria-label="Cerrar"
        >
          <X className="size-5" strokeWidth={1.5} />
        </Primitivo.Close>
      </Primitivo.Content>
    </Primitivo.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof Primitivo.Title>) {
  return <Primitivo.Title className={cn('font-display text-xl font-bold', className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof Primitivo.Description>) {
  return (
    <Primitivo.Description className={cn('mt-2 text-sm text-text-muted', className)} {...props} />
  );
}
