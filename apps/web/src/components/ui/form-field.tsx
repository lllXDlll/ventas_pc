import { useId, type ReactElement, cloneElement } from 'react';
import { cn } from '@/lib/utils';
import { Label } from './input';

// Molécula FormField: etiqueta, control, ayuda y error asociados por id (accesible).
export function FormField({
  etiqueta,
  error,
  ayuda,
  className,
  children,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  className?: string;
  children: ReactElement<{
    id?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }>;
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descritoPor = [ayuda && idAyuda, error && idError].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{etiqueta}</Label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': descritoPor,
      })}
      {ayuda && (
        <p id={idAyuda} className="text-xs text-text-muted">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
