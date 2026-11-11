'use client';

import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSesion } from '../hooks/use-sesion';

/**
 * Muestra el panel solo a un ADMIN (spec autorizacion-roles). A los demás les indica que no
 * tienen acceso sin montar el panel, así que no se piden datos administrativos.
 */
export function SoloAdmin({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  if (usuario === undefined) {
    return (
      <div className="contenedor flex flex-col gap-3 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (usuario?.rol === 'ADMIN') return children;
  return (
    <div className="contenedor flex flex-1 items-center justify-center py-16">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-card border border-border bg-card p-8 text-center">
        <ShieldAlert className="size-10 text-warning" strokeWidth={1.5} aria-hidden="true" />
        {usuario === null ? (
          <>
            <p>Inicia sesión como administrador para usar el panel.</p>
            <Button asChild>
              <Link href="/ingresar">Ingresar</Link>
            </Button>
          </>
        ) : (
          <p role="alert">No tienes acceso al panel de administración.</p>
        )}
      </div>
    </div>
  );
}
