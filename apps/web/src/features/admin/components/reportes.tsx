'use client';

import { Filter } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { RangoFechas } from '../api';

// Presentación de los reportes (spec reportes): filtro, indicadores y tablas.

/** Filtro de fechas no controlado; el contenedor lo refleja en la URL. */
export function FiltroFechas({
  rango,
  onAplicar,
}: {
  rango: { desde: string; hasta: string } | undefined;
  onAplicar: (r: RangoFechas) => void;
}) {
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    onAplicar({
      desde: String(datos.get('desde') ?? '') || undefined,
      hasta: String(datos.get('hasta') ?? '') || undefined,
    });
  };
  return (
    <form
      onSubmit={enviar}
      aria-label="Rango de fechas"
      // La clave remonta el formulario cuando cambia el rango aplicado (valores por defecto).
      key={rango ? `${rango.desde}-${rango.hasta}` : 'sin-rango'}
      className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4"
    >
      <FormField etiqueta="Desde" className="min-w-40 flex-1">
        <Input name="desde" type="date" defaultValue={rango?.desde} />
      </FormField>
      <FormField etiqueta="Hasta" className="min-w-40 flex-1">
        <Input name="hasta" type="date" defaultValue={rango?.hasta} />
      </FormField>
      <Button type="submit" variante="contorno">
        <Filter strokeWidth={1.5} /> Aplicar
      </Button>
    </form>
  );
}

export function Indicadores({
  items,
}: {
  items: { etiqueta: string; valor: string; nota?: string }[];
}) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.etiqueta} className="rounded-card border border-border bg-card p-4">
          <dt className="text-xs text-text-muted">{i.etiqueta}</dt>
          <dd className="mt-1 font-display text-2xl font-bold">{i.valor}</dd>
          {i.nota && <dd className="text-xs text-text-muted">{i.nota}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Tabla accesible con encabezados; las columnas numéricas se alinean a la derecha. */
export function Tabla({
  titulo,
  columnas,
  filas,
}: {
  titulo: string;
  columnas: { etiqueta: string; numerica?: boolean }[];
  filas: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-sm">
        <caption className="px-4 pt-3 text-left font-medium">{titulo}</caption>
        <thead>
          <tr className="border-b border-border text-text-muted">
            {columnas.map((c) => (
              <th
                key={c.etiqueta}
                scope="col"
                className={`px-4 py-2 font-medium ${c.numerica ? 'text-right' : 'text-left'}`}
              >
                {c.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {fila.map((celda, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-4 py-2 text-left font-normal">
                    {celda}
                  </th>
                ) : (
                  <td
                    key={j}
                    className={`px-4 py-2 ${columnas[j]?.numerica ? 'text-right tabular-nums' : ''}`}
                  >
                    {celda}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section
      aria-label={titulo}
      className="flex flex-col gap-3 rounded-card border border-border bg-card p-4"
    >
      <h2 className="font-display text-lg font-bold">{titulo}</h2>
      {children}
    </section>
  );
}
