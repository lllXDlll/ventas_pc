import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Átomo Button (Atomic Design, design D1/D3 del Sprint 1.5), adaptado de shadcn/ui.
export const variantesBoton = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors ' +
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4',
  {
    variants: {
      variante: {
        primario: 'bg-primary text-on-color hover:bg-primary-hover',
        secundario: 'bg-secondary text-on-color hover:brightness-110',
        fantasma: 'text-text hover:bg-card border border-transparent hover:border-border',
        contorno: 'border border-border text-text hover:border-primary-soft hover:bg-card',
        // Solo para "Arma tu PC con IA" (spec sistema-diseno: degradado restringido).
        degradado: 'gradiente-marca text-on-color hover:brightness-110',
        peligro: 'border border-danger text-danger hover:bg-card',
      },
      tamano: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icono: 'size-10',
      },
    },
    defaultVariants: { variante: 'primario', tamano: 'md' },
  },
);

export type PropsBoton = ComponentProps<'button'> &
  VariantProps<typeof variantesBoton> & {
    /** Renderiza el hijo (por ejemplo un Link) con los estilos del botón. */
    asChild?: boolean;
  };

export function Button({ className, variante, tamano, asChild = false, ...props }: PropsBoton) {
  const Componente = asChild ? Slot.Root : 'button';
  return (
    <Componente
      data-slot="button"
      className={cn(variantesBoton({ variante, tamano }), className)}
      {...props}
    />
  );
}
