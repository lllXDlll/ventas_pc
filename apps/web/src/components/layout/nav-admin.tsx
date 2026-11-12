'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Navegación del panel administrativo (Sprint 6): marca la sección actual.

const SECCIONES = [
  { href: '/admin/catalogo', texto: 'Productos y stock' },
  { href: '/admin/reglas', texto: 'Reglas' },
  { href: '/admin/reportes/ventas', texto: 'Reporte de ventas' },
  { href: '/admin/reportes/asistente', texto: 'Reporte del asistente' },
] as const;

export function NavAdmin() {
  const ruta = usePathname();
  return (
    <ul className="flex flex-wrap gap-1 lg:flex-col">
      {SECCIONES.map((s) => {
        const actual = ruta === s.href || ruta.startsWith(`${s.href}/`);
        return (
          <li key={s.href}>
            <Link
              href={s.href}
              aria-current={actual ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center rounded-control px-3 text-sm font-medium text-text-muted hover:text-text',
                actual && 'bg-card text-text',
              )}
            >
              {s.texto}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
