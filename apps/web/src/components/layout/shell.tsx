import { AtSign, Globe, MessageCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CATEGORIAS, NOMBRES_CATEGORIA } from '@/lib/atributos';
import { cn } from '@/lib/utils';
import { BotonProximamente } from '../ui/proximamente';
import { ACCESOS } from './accesos';
import { MobileDrawer, SearchBar } from './interactivos';

// Organismos del shell de la tienda (Atomic Design). Sin datos propios: la zona de cuenta
// y el mega menú llegan como slots desde app/ (spec arquitectura-frontend).

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn('font-display text-2xl font-bold tracking-tight', className)}
      aria-label="XDTech, ir al inicio"
    >
      <span className="texto-gradiente">XDTech</span>
    </Link>
  );
}

export function TopBar() {
  return (
    <div className="border-b border-border bg-surface text-xs text-text-muted print:hidden">
      <p className="contenedor flex h-8 items-center justify-center gap-1 text-center">
        <Sparkles className="size-3.5 text-secondary-soft" strokeWidth={1.5} aria-hidden="true" />
        Arma tu PC con IA y valida compatibilidad al instante
      </p>
    </div>
  );
}

/** Accesos rápidos: los de sprints futuros solo avisan "Disponible pronto". */
export function QuickLinks({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-1', className)} aria-label="Accesos rápidos">
      {ACCESOS.map(({ texto, icono: Icono, href }) => (
        <li key={texto}>
          {href ? (
            <Link
              href={href}
              className="inline-flex h-8 items-center gap-2 rounded-control px-3 text-sm hover:bg-card"
            >
              <Icono className="size-4" strokeWidth={1.5} /> {texto}
            </Link>
          ) : (
            <BotonProximamente variante="fantasma" tamano="sm" className="[&>span]:sr-only">
              <Icono strokeWidth={1.5} /> {texto}
            </BotonProximamente>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Cabecera fija: logo, buscador, cuenta, notificaciones y carrito; debajo, categorías. */
export function Header({
  cuenta,
  megaMenu,
  carrito,
  notificaciones,
}: {
  cuenta: ReactNode;
  megaMenu: ReactNode;
  /** Contador del carrito (contenedor de features/carrito). */
  carrito: ReactNode;
  /** Campana de notificaciones (contenedor de features/notificaciones); vacía sin sesión. */
  notificaciones?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur print:hidden">
      <div className="contenedor flex h-16 items-center gap-3">
        <MobileDrawer cuenta={cuenta} />
        <Logo className="shrink-0" />
        <SearchBar className="mx-auto hidden max-w-xl flex-1 md:flex" />
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <div className="hidden md:flex">{cuenta}</div>
          <SearchBar movil />
          {notificaciones}
          {carrito}
        </div>
      </div>
      <nav aria-label="Navegación principal" className="hidden border-t border-border md:block">
        <div className="contenedor flex h-11 items-center gap-2">
          {megaMenu}
          <QuickLinks className="hidden lg:flex" />
        </div>
      </nav>
    </header>
  );
}

const COLUMNAS_PIE: { titulo: string; enlaces: { texto: string; href?: string }[] }[] = [
  {
    titulo: 'Tienda',
    enlaces: [
      { texto: 'Catálogo', href: '/catalogo' },
      ...CATEGORIAS.slice(0, 4).map((c) => ({
        texto: NOMBRES_CATEGORIA[c],
        href: `/catalogo?categoria=${c}`,
      })),
    ],
  },
  {
    titulo: 'Ayuda',
    enlaces: [
      { texto: 'Envíos y recojo' },
      { texto: 'Garantías' },
      { texto: 'Preguntas frecuentes' },
    ],
  },
  {
    titulo: 'Cuenta',
    enlaces: [
      { texto: 'Ingresar', href: '/ingresar' },
      { texto: 'Crear cuenta', href: '/registro' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface print:hidden">
      <div className="contenedor grid gap-8 py-10 md:grid-cols-4">
        {COLUMNAS_PIE.map((col) => (
          <section key={col.titulo} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold">{col.titulo}</h2>
            <ul className="flex flex-col gap-2 text-sm text-text-muted">
              {col.enlaces.map((e) => (
                <li key={e.texto}>
                  {e.href ? (
                    <Link href={e.href} className="hover:text-text">
                      {e.texto}
                    </Link>
                  ) : (
                    e.texto
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold">Redes</h2>
          <ul className="flex flex-col gap-2 text-sm text-text-muted">
            {[
              { icono: Globe, texto: 'Facebook' },
              { icono: AtSign, texto: 'Instagram' },
              { icono: MessageCircle, texto: 'WhatsApp' },
            ].map(({ icono: Icono, texto }) => (
              <li key={texto} className="flex items-center gap-2">
                <Icono className="size-4" strokeWidth={1.5} aria-hidden="true" /> {texto}
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-muted">Ayacucho, Perú</p>
        </section>
      </div>
      <p className="border-t border-border py-4 text-center text-xs text-text-muted">
        © {new Date().getFullYear()} XDTech · Proyecto académico
      </p>
    </footer>
  );
}

/** Marco del panel administrativo: barra lateral y contenido. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="contenedor grid flex-1 grid-cols-[minmax(0,1fr)] gap-6 py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside aria-label="Administración" className="lg:border-r lg:border-border lg:pr-4">
        <p className="mb-3 text-xs font-medium tracking-wide text-text-muted uppercase">
          Administración
        </p>
        <ul className="flex gap-1 lg:flex-col">
          <li>
            <Link
              href="/admin/catalogo"
              className="flex h-9 items-center rounded-control bg-card px-3 text-sm font-medium"
              aria-current="page"
            >
              Productos y stock
            </Link>
          </li>
        </ul>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
