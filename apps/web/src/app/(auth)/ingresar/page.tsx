import type { Metadata } from 'next';
import { Suspense } from 'react';
import { IngresarContenedor } from '@/features/auth/contenedores/cuenta';

export const metadata: Metadata = { title: 'Iniciar sesión' };

/** Suspense: el contenedor lee ?volver= (vuelta al armador tras iniciar sesión). */
export default function Ingresar() {
  return (
    <Suspense>
      <IngresarContenedor />
    </Suspense>
  );
}
