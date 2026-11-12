'use client';

import { Bot, Loader2, ShoppingCart, Sparkles, Wrench } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { ImagenProducto } from '@/components/producto/producto';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { formatoPrecio } from '@/lib/format';
import { DESCRIPCION_USO, NOMBRES_USO, nombreUso, type Uso, USOS } from '@/lib/usos';
import type { EstadoLimite, Recomendacion } from '../api';

// Presentación del asistente (spec asistente): los datos llegan por props.

export function ConsultasRestantes({ estado }: { estado: EstadoLimite | undefined }) {
  if (!estado) return null;
  const quedan = Math.max(0, estado.limite - estado.usadas);
  return (
    <p className="text-sm text-text-muted" role="status">
      Te quedan {quedan} de {estado.limite} consultas en las últimas 24 horas.
    </p>
  );
}

/** Formulario no controlado: presupuesto y uso. */
export function FormularioAsistente({
  enviando,
  error,
  onEnviar,
}: {
  enviando: boolean;
  error: string | null;
  onEnviar: (v: { presupuesto: number; uso: Uso }) => void;
}) {
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando) return;
    const datos = new FormData(e.currentTarget);
    onEnviar({
      presupuesto: Number(datos.get('presupuesto')),
      uso: String(datos.get('uso') ?? 'OTRO') as Uso,
    });
  };
  return (
    <form
      onSubmit={enviar}
      aria-label="Pedir una recomendación"
      className="flex flex-col gap-5 rounded-card border border-border bg-card p-5"
    >
      <FormField etiqueta="Presupuesto (S/)" ayuda="Entre S/ 1 y S/ 100 000.">
        <Input
          name="presupuesto"
          type="number"
          inputMode="decimal"
          min={1}
          max={100000}
          step="0.01"
          required
          placeholder="4500"
        />
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">¿Para qué la vas a usar?</legend>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
          {USOS.map((u, i) => (
            <label
              key={u}
              className="flex cursor-pointer gap-3 rounded-control border border-border p-3 has-checked:border-primary has-focus-visible:outline-2 has-focus-visible:outline-primary"
            >
              <input type="radio" name="uso" value={u} defaultChecked={i === 0} className="mt-1" />
              <span>
                <span className="block font-medium">{NOMBRES_USO[u]}</span>
                <span className="text-xs text-text-muted">{DESCRIPCION_USO[u]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p
          role="alert"
          className="rounded-control border border-warning/50 p-3 text-sm text-warning"
        >
          {error}
        </p>
      )}
      <Button type="submit" variante="degradado" tamano="lg" disabled={enviando}>
        <Sparkles strokeWidth={1.5} /> {enviando ? 'Armando tu PC…' : 'Recomendar mi PC'}
      </Button>
    </form>
  );
}

export function EsperaAsistente() {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-card border border-border bg-card p-5 text-sm"
    >
      <Loader2 className="size-5 animate-spin text-primary-soft" aria-hidden="true" />
      Armando tu PC: elegimos componentes con stock y validamos su compatibilidad. Puede tardar unos
      segundos.
    </div>
  );
}

export function ResultadoAsistente({
  r,
  agregando,
  errorCarrito,
  onAgregar,
}: {
  r: Recomendacion;
  agregando: boolean;
  errorCarrito: string | null;
  onAgregar: () => void;
}) {
  const c = r.configuracion;
  return (
    <section aria-label="Recomendación" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {r.respaldo ? (
          <Badge variante="neutra">
            <Bot strokeWidth={1.5} /> Recomendación de respaldo (sin IA)
          </Badge>
        ) : (
          <Badge variante="ia">
            <Sparkles strokeWidth={1.5} /> Recomendada por IA
          </Badge>
        )}
        <span className="text-sm text-text-muted">
          {nombreUso(c.uso)} · presupuesto {formatoPrecio(c.presupuesto ?? '0')}
        </span>
      </div>
      {r.resumen && <p className="text-sm">{r.resumen}</p>}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-label="Componentes recomendados">
        {c.items.map((i) => (
          <li
            key={i.producto.id}
            className="flex gap-4 rounded-card border border-border bg-card p-4"
          >
            <ImagenProducto producto={i.producto} className="size-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-muted">{i.producto.categoria.nombre}</p>
              <p className="font-medium">
                {i.cantidad > 1 ? `${i.cantidad} × ` : ''}
                {i.producto.nombre}
              </p>
              <p className="mt-1 text-sm text-text-muted">{r.explicaciones[i.producto.id]}</p>
            </div>
            <span className="shrink-0 font-display font-bold">
              {formatoPrecio(Number(i.producto.precio) * i.cantidad)}
            </span>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3">
        <span className="text-sm text-text-muted">
          Total (presupuesto {formatoPrecio(c.presupuesto ?? '0')})
        </span>
        <span className="font-display text-2xl font-bold">{formatoPrecio(c.total)}</span>
      </p>
      {errorCarrito && (
        <p role="alert" className="text-sm text-danger">
          {errorCarrito}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!c.agregable || agregando} onClick={onAgregar}>
          <ShoppingCart strokeWidth={1.5} /> {agregando ? 'Agregando…' : 'Agregar al carrito'}
        </Button>
        <Button asChild variante="contorno">
          <Link href={`/armador?config=${c.id}`}>
            <Wrench strokeWidth={1.5} /> Editar en el armador
          </Link>
        </Button>
      </div>
    </section>
  );
}
