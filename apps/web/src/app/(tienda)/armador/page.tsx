import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ArmadorContenedor } from '@/features/armador/contenedores/armador';

export const metadata: Metadata = { title: 'Arma tu PC' };

/** Armador manual (spec armador). Solo de cliente: el estado vive en la URL. */
export default function Armador() {
  return (
    <Suspense>
      <ArmadorContenedor />
    </Suspense>
  );
}
