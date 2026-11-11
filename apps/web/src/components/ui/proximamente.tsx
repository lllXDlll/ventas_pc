'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button, type PropsBoton } from './button';

/**
 * Acción de un sprint futuro (carrito, armado, asistente, ofertas): visible, pero solo
 * avisa "Disponible pronto" y no ejecuta nada contra la API (spec sistema-diseno).
 */
export function BotonProximamente({
  children,
  className,
  ...props
}: Omit<PropsBoton, 'onClick' | 'asChild'> & { children: ReactNode }) {
  const [aviso, setAviso] = useState(false);
  return (
    <span className={cn('inline-flex flex-col items-start gap-1', className)}>
      <Button
        type="button"
        aria-disabled="true"
        title="Disponible pronto"
        onClick={() => setAviso(true)}
        {...props}
      >
        {children}
      </Button>
      <span aria-live="polite" className="text-xs text-text-muted">
        {aviso ? 'Disponible pronto' : ''}
      </span>
    </span>
  );
}
