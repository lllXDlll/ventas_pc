'use client';

import { AlertTriangle, PackageSearch, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

// Moléculas de estado vacío y de error (spec sistema-diseno).

export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  className,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-dashed border-border p-8 text-center',
        className,
      )}
    >
      <PackageSearch className="size-10 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
      <p className="font-display text-lg font-bold">{titulo}</p>
      {descripcion && <p className="text-sm text-text-muted">{descripcion}</p>}
      {accion}
    </div>
  );
}

export function EstadoError({
  mensaje,
  onReintentar,
  className,
}: {
  mensaje: string;
  onReintentar?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-danger/40 bg-card p-8 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-10 text-danger" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-sm">{mensaje}</p>
      {onReintentar && (
        <Button variante="contorno" onClick={onReintentar}>
          <RotateCw strokeWidth={1.5} /> Reintentar
        </Button>
      )}
    </div>
  );
}
