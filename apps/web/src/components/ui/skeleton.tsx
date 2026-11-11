import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Átomo Skeleton: estado de carga (spec sistema-diseno).
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-control bg-border/60', className)}
      {...props}
    />
  );
}
