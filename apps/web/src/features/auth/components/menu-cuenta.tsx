import { LayoutDashboard, LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Usuario } from '@/lib/tipos';
import { cn } from '@/lib/utils';

/** Zona "Mi cuenta" de la cabecera (presentación): recibe el usuario por props. */
export function MenuCuenta({
  usuario,
  onSalir,
  className,
}: {
  usuario: Usuario | null | undefined;
  onSalir: () => void;
  className?: string;
}) {
  if (usuario === undefined) return <Skeleton className={cn('h-9 w-28', className)} />;
  if (usuario === null) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Button asChild variante="fantasma" tamano="sm">
          <Link href="/ingresar">
            <User strokeWidth={1.5} /> Ingresar
          </Link>
        </Button>
        <Button asChild variante="contorno" tamano="sm">
          <Link href="/registro">Crear cuenta</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      {usuario.rol === 'ADMIN' && (
        <Button asChild variante="fantasma" tamano="sm">
          <Link href="/admin/catalogo">
            <LayoutDashboard strokeWidth={1.5} /> Panel
          </Link>
        </Button>
      )}
      <span className="max-w-48 truncate text-sm text-text-muted" title={usuario.correo}>
        {usuario.correo}
      </span>
      <Button variante="fantasma" tamano="sm" type="button" onClick={onSalir}>
        <LogOut strokeWidth={1.5} /> Cerrar sesión
      </Button>
    </div>
  );
}
