import { BadgeCheck, MapPin, PackageCheck, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BotonProximamente } from '@/components/ui/proximamente';
import { CATEGORIAS, NOMBRES_CATEGORIA } from '@/lib/atributos';
import { ICONO_CATEGORIA } from '@/lib/iconos-categoria';

// Bloques de la página de inicio (presentación).

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-modal border border-border bg-surface">
      <div className="fondo-tenue absolute inset-0" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 px-6 py-12 md:px-12 md:py-16">
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-secondary/50 px-3 py-1 text-xs text-secondary-soft">
          <Sparkles className="size-3.5" strokeWidth={1.5} /> Armador con IA
        </span>
        <h1 className="max-w-2xl text-3xl leading-tight md:text-4xl">
          Arma tu PC con <span className="texto-gradiente">compatibilidad validada</span> al
          instante
        </h1>
        <p className="max-w-xl text-text-muted">
          Componentes y equipos armados con stock real. Cada pieza se valida contra las demás antes
          de llegar a tu carrito.
        </p>
        <div className="flex flex-wrap gap-3">
          <BotonProximamente variante="degradado" tamano="lg">
            <Sparkles strokeWidth={1.5} /> Arma tu PC con IA
          </BotonProximamente>
          <Button asChild variante="contorno" tamano="lg">
            <Link href="/catalogo">Ver catálogo</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function CategoryGrid() {
  return (
    <section aria-labelledby="titulo-categorias" className="flex flex-col gap-4">
      <h2 id="titulo-categorias" className="text-2xl">
        Categorías
      </h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {CATEGORIAS.map((c) => {
          const Icono = ICONO_CATEGORIA[c];
          return (
            <li key={c}>
              <Link
                href={`/catalogo?categoria=${c}`}
                className="flex h-full flex-col items-center gap-3 rounded-card border border-border bg-card p-5 text-center text-sm font-medium transition-shadow hover:border-primary hover:shadow-hover"
              >
                <Icono className="size-8 text-primary-soft" strokeWidth={1.5} aria-hidden="true" />
                {NOMBRES_CATEGORIA[c]}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const CONFIANZA = [
  {
    icono: BadgeCheck,
    titulo: 'Compatibilidad validada',
    texto: 'Reglas de socket, RAM, potencia y medidas.',
  },
  { icono: PackageCheck, titulo: 'Stock real', texto: 'Lo que ves disponible, existe.' },
  { icono: ShieldCheck, titulo: 'Pago seguro', texto: 'Pago simulado en esta versión.' },
  { icono: MapPin, titulo: 'Soporte local', texto: 'Atención en Ayacucho.' },
];

export function TrustBar() {
  return (
    <section aria-label="Por qué XDTech">
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {CONFIANZA.map(({ icono: Icono, titulo, texto }) => (
          <li
            key={titulo}
            className="flex items-start gap-3 rounded-card border border-border bg-surface p-4"
          >
            <Icono className="size-6 shrink-0 text-success" strokeWidth={1.5} aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{titulo}</p>
              <p className="text-xs text-text-muted">{texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
