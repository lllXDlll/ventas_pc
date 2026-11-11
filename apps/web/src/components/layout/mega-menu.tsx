'use client';

import { ChevronDown, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { CATEGORIAS, NOMBRES_CATEGORIA } from '@/lib/atributos';
import { ICONO_CATEGORIA } from '@/lib/iconos-categoria';

/**
 * "Todas las categorías": mega menú con las 8 categorías y una columna de marcas.
 * Radix Popover: Enter abre, Tab recorre, Esc cierra y devuelve el foco al botón.
 */
export function MegaMenu({ marcas }: { marcas: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);
  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      <Popover.Trigger className="inline-flex h-8 items-center gap-2 rounded-control bg-primary px-3 text-sm font-medium text-on-color hover:bg-primary-hover">
        <LayoutGrid className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Todas las categorías
        <ChevronDown className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          aria-label="Categorías y marcas"
          className="z-50 grid w-[min(720px,calc(100vw-32px))] gap-6 rounded-card border border-border bg-card p-5 shadow-xl md:grid-cols-[2fr_1fr]"
        >
          <section>
            <h2 className="mb-3 text-xs font-medium tracking-wide text-text-muted uppercase">
              Categorías
            </h2>
            <ul className="grid grid-cols-2 gap-1">
              {CATEGORIAS.map((c) => {
                const Icono = ICONO_CATEGORIA[c];
                return (
                  <li key={c}>
                    <Link
                      href={`/catalogo?categoria=${c}`}
                      onClick={cerrar}
                      className="flex h-10 items-center gap-3 rounded-control px-2 text-sm hover:bg-surface"
                    >
                      <Icono className="size-5 text-primary-soft" strokeWidth={1.5} />
                      {NOMBRES_CATEGORIA[c]}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 text-xs font-medium tracking-wide text-text-muted uppercase">
              Marcas
            </h2>
            {marcas.length === 0 ? (
              <p className="text-sm text-text-muted">Cargando marcas…</p>
            ) : (
              <ul className="grid grid-cols-2 gap-1 md:grid-cols-1">
                {marcas.slice(0, 12).map((m) => (
                  <li key={m}>
                    <Link
                      href={`/catalogo?marca=${encodeURIComponent(m)}`}
                      onClick={cerrar}
                      className="flex h-8 items-center rounded-control px-2 text-sm hover:bg-surface"
                    >
                      {m}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
