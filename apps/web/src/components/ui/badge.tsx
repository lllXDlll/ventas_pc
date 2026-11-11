import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Átomo Badge: estados de stock y compatibilidad, e insignia de IA (design D3 del Sprint 1.5).
export const variantesInsignia = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5',
  {
    variants: {
      variante: {
        neutra: 'border-border bg-surface text-text-muted',
        exito: 'border-success/40 bg-card text-success',
        advertencia: 'border-warning/40 bg-card text-warning',
        peligro: 'border-danger/40 bg-card text-danger',
        ia: 'border-secondary/50 bg-card text-secondary-soft',
      },
    },
    defaultVariants: { variante: 'neutra' },
  },
);

export function Badge({
  className,
  variante,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof variantesInsignia>) {
  return (
    <span data-slot="badge" className={cn(variantesInsignia({ variante }), className)} {...props} />
  );
}
