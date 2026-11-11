import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Molécula Card: sin sombra en reposo; en hover, borde y brillo morado (design D3).
export function Card({
  className,
  interactiva = false,
  ...props
}: ComponentProps<'div'> & { interactiva?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-card border border-border bg-card text-text',
        interactiva && 'transition-shadow hover:border-primary hover:shadow-hover',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('font-display text-xl font-bold', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}
