'use client';

import { Menu, Search, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, Suspense, useEffect, useState } from 'react';
import { CATEGORIAS, NOMBRES_CATEGORIA } from '@/lib/atributos';
import { ICONO_CATEGORIA } from '@/lib/iconos-categoria';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Input } from '../ui/input';
import { ACCESOS } from './accesos';

function FormularioBusqueda({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const q = useSearchParams().get('q') ?? '';
  const [texto, setTexto] = useState(q);
  useEffect(() => setTexto(q), [q]);
  function enviar(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    router.push(t ? `/catalogo?q=${encodeURIComponent(t)}` : '/catalogo');
  }
  return (
    <form role="search" onSubmit={enviar} className={cn('relative flex w-full', className)}>
      <label htmlFor={autoFocus ? 'buscar-movil' : 'buscar'} className="sr-only">
        Buscar productos
      </label>
      <Input
        id={autoFocus ? 'buscar-movil' : 'buscar'}
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Busca procesadores, RAM, marcas…"
        className="pr-11"
        autoFocus={autoFocus}
        minLength={2}
      />
      <button
        type="submit"
        aria-label="Buscar"
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-muted hover:text-text"
      >
        <Search className="size-4" strokeWidth={1.5} />
      </button>
    </form>
  );
}

/** Buscador de la cabecera; en móvil, un botón que lo despliega. */
export function SearchBar({ className, movil = false }: { className?: string; movil?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();
  useEffect(() => setAbierto(false), [ruta]);
  if (!movil) {
    return (
      <Suspense fallback={<div className={className} />}>
        <FormularioBusqueda className={className} />
      </Suspense>
    );
  }
  return (
    <div className="md:hidden">
      <Button
        variante="fantasma"
        tamano="icono"
        aria-label="Buscar"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <Search strokeWidth={1.5} />
      </Button>
      {abierto && (
        <div className="absolute inset-x-0 top-16 border-b border-border bg-surface p-3">
          <Suspense>
            <FormularioBusqueda autoFocus />
          </Suspense>
        </div>
      )}
    </div>
  );
}

export function BotonCarrito() {
  return (
    <Button
      variante="fantasma"
      tamano="icono"
      className="relative"
      aria-disabled="true"
      title="Carrito: disponible pronto"
    >
      <ShoppingCart strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">Carrito (disponible pronto)</span>
      <span
        aria-hidden="true"
        className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-on-color"
      >
        0
      </span>
    </Button>
  );
}

/** Menú lateral en móvil: categorías, accesos y cuenta. El foco queda dentro hasta Esc. */
export function MobileDrawer({ cuenta }: { cuenta: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();
  useEffect(() => setAbierto(false), [ruta]);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variante="fantasma" tamano="icono" className="md:hidden" aria-label="Abrir menú">
          <Menu strokeWidth={1.5} />
        </Button>
      </DialogTrigger>
      <DialogContent lado="izquierda" aria-describedby={undefined}>
        <DialogTitle className="mb-4">Menú</DialogTitle>
        <div className="mb-4 [&_div]:flex-wrap">{cuenta}</div>
        <p className="mb-2 text-xs font-medium tracking-wide text-text-muted uppercase">
          Categorías
        </p>
        <ul className="mb-4 flex flex-col">
          {CATEGORIAS.map((c) => {
            const Icono = ICONO_CATEGORIA[c];
            return (
              <li key={c}>
                <Link
                  href={`/catalogo?categoria=${c}`}
                  className="flex h-10 items-center gap-3 rounded-control px-2 text-sm hover:bg-surface"
                >
                  <Icono className="size-4 text-primary-soft" strokeWidth={1.5} />
                  {NOMBRES_CATEGORIA[c]}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mb-2 text-xs font-medium tracking-wide text-text-muted uppercase">Accesos</p>
        <ul className="flex flex-col">
          {ACCESOS.map(({ texto, href, icono: Icono }) => (
            <li key={texto}>
              {href ? (
                <Link
                  href={href}
                  className="flex h-10 items-center gap-3 rounded-control px-2 text-sm hover:bg-surface"
                >
                  <Icono className="size-4" strokeWidth={1.5} /> {texto}
                </Link>
              ) : (
                <span className="flex h-10 items-center gap-3 px-2 text-sm text-text-muted">
                  <Icono className="size-4" strokeWidth={1.5} /> {texto} · Disponible pronto
                </span>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
