import type { Metadata } from 'next';
import { IngresarContenedor } from '@/features/auth/contenedores/cuenta';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default function Ingresar() {
  return <IngresarContenedor />;
}
