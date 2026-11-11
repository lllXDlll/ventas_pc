import type { Metadata } from 'next';
import { RegistroContenedor } from '@/features/auth/contenedores/cuenta';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function Registro() {
  return <RegistroContenedor />;
}
