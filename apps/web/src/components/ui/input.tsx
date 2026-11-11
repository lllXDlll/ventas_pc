import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const base =
  'w-full rounded-control border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted ' +
  'transition-colors hover:border-primary-soft/60 focus-visible:border-primary-soft ' +
  'aria-invalid:border-danger disabled:opacity-50';

// Átomos de formulario (design D3 del Sprint 1.5).
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(base, 'h-10', className)} {...props} />;
}

/** Select nativo: accesible por teclado y compatible con selectOption de las pruebas. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select data-slot="select" className={cn(base, 'h-10 pr-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea data-slot="textarea" className={cn(base, 'min-h-24 py-2', className)} {...props} />
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn('text-sm font-medium text-text', className)}
      {...props}
    />
  );
}
