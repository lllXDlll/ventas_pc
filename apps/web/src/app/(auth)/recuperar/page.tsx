import { Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AuthCard } from '@/features/auth/components/auth-card';

export const metadata: Metadata = { title: 'Recuperar acceso' };

/**
 * Recuperación de acceso (spec autenticacion): HU-03 sigue diferida, así que solo informa
 * "Disponible pronto". Sin formulario ni peticiones a la API.
 */
export default function Recuperar() {
  return (
    <AuthCard titulo="Recuperar acceso">
      <div className="flex flex-col items-start gap-4">
        <p className="inline-flex items-center gap-2 font-display text-xl font-bold text-primary-soft">
          <Clock className="size-5" strokeWidth={1.5} aria-hidden="true" /> Disponible pronto
        </p>
        <p className="text-sm text-text-muted">
          Por ahora, si olvidaste tu contraseña, pide al administrador de la tienda que restablezca
          tu cuenta.
        </p>
        <Button asChild variante="contorno">
          <Link href="/ingresar">Volver a iniciar sesión</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
