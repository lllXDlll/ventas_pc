'use client';

import { Save } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { Regla } from '../api';

// Presentación de las reglas de compatibilidad (spec gestion-reglas): los datos llegan por props.

export interface ResultadoGuardado {
  tipo: 'exito' | 'error';
  mensaje: string;
  /** Parámetro al que se refiere el error de la API, para mostrarlo junto a su campo. */
  parametro?: string;
}

/** Una tarjeta por regla, con formulario no controlado: interruptor y un campo por parámetro. */
export function TarjetaRegla({
  regla,
  guardando,
  resultado,
  onGuardar,
}: {
  regla: Regla;
  guardando: boolean;
  resultado: ResultadoGuardado | null;
  onGuardar: (cambios: { activa: boolean; parametros?: Record<string, number> }) => void;
}) {
  const idTitulo = `regla-${regla.codigo}`;
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (guardando) return;
    const datos = new FormData(e.currentTarget);
    const parametros = Object.fromEntries(
      regla.descripcion.map((d) => [d.nombre, Number(datos.get(d.nombre))]),
    );
    onGuardar({
      activa: datos.get('activa') === 'on',
      ...(regla.descripcion.length ? { parametros } : {}),
    });
  };
  const errorGeneral =
    resultado?.tipo === 'error' && !resultado.parametro ? resultado.mensaje : null;
  return (
    <form
      onSubmit={enviar}
      aria-labelledby={idTitulo}
      className="flex flex-col gap-4 rounded-card border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={idTitulo} className="font-display text-lg font-bold">
            {regla.nombre}
          </h2>
          <p className="text-xs text-text-muted">{regla.codigo}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            name="activa"
            defaultChecked={regla.activa}
            className="size-5 accent-primary"
          />
          Activa
        </label>
      </div>
      {regla.descripcion.length > 0 ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          {regla.descripcion.map((d) => (
            <FormField
              key={d.nombre}
              etiqueta={`${d.etiqueta} (${d.unidad})`}
              ayuda={`Entre ${d.min} y ${d.max} ${d.unidad}.`}
              error={
                resultado?.tipo === 'error' && resultado.parametro === d.nombre
                  ? resultado.mensaje
                  : undefined
              }
            >
              <Input
                name={d.nombre}
                type="number"
                inputMode="numeric"
                step={d.entero ? 1 : 'any'}
                required
                defaultValue={regla.parametros[d.nombre]}
              />
            </FormField>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Esta regla no tiene parámetros: solo se activa o desactiva.
        </p>
      )}
      {errorGeneral && (
        <p role="alert" className="text-sm text-danger">
          {errorGeneral}
        </p>
      )}
      {resultado?.tipo === 'exito' && (
        <p role="status" className="text-sm text-success">
          {resultado.mensaje}
        </p>
      )}
      <div>
        <Button type="submit" disabled={guardando}>
          <Save strokeWidth={1.5} /> {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
