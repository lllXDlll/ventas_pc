'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input, Select } from '@/components/ui/input';
import { CATEGORIAS, NOMBRES_CATEGORIA } from '@/lib/atributos';
import { formatoPrecio } from '@/lib/format';
import type { Facetas } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { aConsulta, type FiltrosCatalogo, marcasDe, ORDENES, type Orden } from '../filtros';

// Filtros del catálogo (presentación): reciben los filtros y avisan de los cambios.

function Casillas({
  titulo,
  opciones,
  elegidas,
  onCambiar,
}: {
  titulo: string;
  opciones: { valor: string; cantidad: number }[];
  elegidas: string[];
  onCambiar: (valores: string[]) => void;
}) {
  if (opciones.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{titulo}</legend>
      {opciones.map((o) => {
        const marcada = elegidas.some((e) => e.toLowerCase() === o.valor.toLowerCase());
        return (
          <label key={o.valor} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={marcada}
              onChange={() =>
                onCambiar(
                  marcada
                    ? elegidas.filter((e) => e.toLowerCase() !== o.valor.toLowerCase())
                    : [...elegidas, o.valor],
                )
              }
            />
            <span className="flex-1">{o.valor}</span>
            <span className="text-xs text-text-muted">{o.cantidad}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * Categoría y precio en un formulario GET con "Filtrar" (funciona sin JavaScript); marcas
 * y sockets se aplican al marcarlos (design D5 del Sprint 1.5).
 */
export function FiltrosSidebar({
  filtros,
  facetas,
  onCambiar,
}: {
  filtros: FiltrosCatalogo;
  facetas: Facetas | undefined;
  onCambiar: (cambios: Partial<FiltrosCatalogo>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <form method="get" action="/catalogo" className="flex flex-col gap-4">
        {filtros.q && <input type="hidden" name="q" value={filtros.q} />}
        {filtros.orden && <input type="hidden" name="orden" value={filtros.orden} />}
        <FormField etiqueta="Categoría">
          <Select
            name="categoria"
            defaultValue={filtros.categoria ?? ''}
            key={filtros.categoria}
            onChange={(e) =>
              onCambiar({
                categoria: (e.target.value || undefined) as FiltrosCatalogo['categoria'],
              })
            }
          >
            <option value="">Todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {NOMBRES_CATEGORIA[c]}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-2">
          <FormField etiqueta="Precio mínimo">
            <Input
              name="precioMin"
              inputMode="decimal"
              defaultValue={filtros.precioMin}
              key={`min-${filtros.precioMin}`}
              placeholder={facetas?.precio ? formatoPrecio(facetas.precio.min) : 'S/ 0'}
            />
          </FormField>
          <FormField etiqueta="Precio máximo">
            <Input
              name="precioMax"
              inputMode="decimal"
              defaultValue={filtros.precioMax}
              key={`max-${filtros.precioMax}`}
              placeholder={facetas?.precio ? formatoPrecio(facetas.precio.max) : ''}
            />
          </FormField>
        </div>
        <Button type="submit">Filtrar</Button>
      </form>
      <Casillas
        titulo="Marca"
        opciones={facetas?.marcas ?? []}
        elegidas={marcasDe(filtros)}
        onCambiar={(v) => onCambiar({ marca: v.join(',') || undefined })}
      />
      <Casillas
        titulo="Socket"
        opciones={facetas?.sockets ?? []}
        elegidas={filtros.socket ? [filtros.socket] : []}
        onCambiar={(v) => onCambiar({ socket: v.at(-1) })}
      />
    </div>
  );
}

/** Chips de los filtros activos: cada uno se quita por separado. */
export function FilterChips({
  filtros,
  onQuitar,
  onLimpiar,
}: {
  filtros: FiltrosCatalogo;
  onQuitar: (cambios: Partial<FiltrosCatalogo>) => void;
  onLimpiar: () => void;
}) {
  const chips: { texto: string; quitar: Partial<FiltrosCatalogo> }[] = [];
  if (filtros.categoria)
    chips.push({ texto: NOMBRES_CATEGORIA[filtros.categoria], quitar: { categoria: undefined } });
  for (const m of marcasDe(filtros)) {
    const resto = marcasDe(filtros).filter((x) => x !== m);
    chips.push({ texto: m, quitar: { marca: resto.join(',') || undefined } });
  }
  if (filtros.socket) chips.push({ texto: filtros.socket, quitar: { socket: undefined } });
  if (filtros.precioMin)
    chips.push({
      texto: `Desde ${formatoPrecio(filtros.precioMin)}`,
      quitar: { precioMin: undefined },
    });
  if (filtros.precioMax)
    chips.push({
      texto: `Hasta ${formatoPrecio(filtros.precioMax)}`,
      quitar: { precioMax: undefined },
    });
  if (filtros.q) chips.push({ texto: `"${filtros.q}"`, quitar: { q: undefined } });
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Filtros activos">
      {chips.map((c) => (
        <li key={c.texto}>
          <button
            type="button"
            onClick={() => onQuitar(c.quitar)}
            className="inline-flex items-center gap-1 rounded-full border border-primary/60 bg-card px-3 py-1 text-xs text-primary-soft hover:border-primary-soft"
            aria-label={`Quitar filtro ${c.texto}`}
          >
            {c.texto} <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </li>
      ))}
      <li>
        <button type="button" onClick={onLimpiar} className="text-xs text-text-muted underline">
          Limpiar filtros
        </button>
      </li>
    </ul>
  );
}

export function SortSelect({
  orden,
  onCambiar,
}: {
  orden: Orden | undefined;
  onCambiar: (orden: Orden) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-text-muted">Ordenar por</span>
      <Select
        className="w-auto"
        value={orden ?? 'nombre'}
        onChange={(e) => onCambiar(e.target.value as Orden)}
      >
        {ORDENES.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** Paginación con enlaces: conserva los filtros en la URL. */
export function Pagination({
  filtros,
  pagina,
  paginas,
}: {
  filtros: FiltrosCatalogo;
  pagina: number;
  paginas: number;
}) {
  if (paginas <= 1) return null;
  const href = (n: number) =>
    `/catalogo${aConsulta(filtros, { pagina: n > 1 ? String(n) : undefined })}`;
  const numeros = Array.from({ length: paginas }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === paginas || Math.abs(n - pagina) <= 1,
  );
  const clase =
    'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-control border border-border px-3 text-sm hover:border-primary-soft';
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-center gap-2">
      {pagina > 1 && (
        <Link href={href(pagina - 1)} className={clase}>
          <ChevronLeft className="size-4" strokeWidth={1.5} /> Anterior
        </Link>
      )}
      {numeros.map((n, i) => (
        <span key={n} className="contents">
          {i > 0 && numeros[i - 1] !== n - 1 && <span className="text-text-muted">…</span>}
          <Link
            href={href(n)}
            aria-current={n === pagina ? 'page' : undefined}
            className={cn(clase, n === pagina && 'border-primary bg-primary text-on-color')}
          >
            {n}
          </Link>
        </span>
      ))}
      {pagina < paginas && (
        <Link href={href(pagina + 1)} className={clase}>
          Siguiente <ChevronRight className="size-4" strokeWidth={1.5} />
        </Link>
      )}
    </nav>
  );
}

export function Breadcrumbs({ items }: { items: { texto: string; href?: string }[] }) {
  return (
    <nav aria-label="Ruta de navegación" className="text-sm text-text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={it.texto} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
            {it.href ? (
              <Link href={it.href} className="hover:text-text">
                {it.texto}
              </Link>
            ) : (
              <span aria-current="page" className="text-text">
                {it.texto}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
