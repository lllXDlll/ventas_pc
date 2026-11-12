'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { EstadoError } from '@/components/ui/estado';
import { Skeleton } from '@/components/ui/skeleton';
import { mensajeDeError } from '@/lib/api-client';
import { actualizarRegla, opcionesReglas, type Regla } from '../api';
import { type ResultadoGuardado, TarjetaRegla } from '../components/reglas';

/** Reglas de compatibilidad editables (spec gestion-reglas). Solo se monta para un ADMIN. */
export function ReglasContenedor() {
  const cliente = useQueryClient();
  const reglas = useQuery(opcionesReglas());
  const [resultados, setResultados] = useState<Record<string, ResultadoGuardado>>({});
  const guardar = useMutation({
    mutationFn: ({
      codigo,
      cambios,
    }: {
      codigo: string;
      cambios: Parameters<typeof actualizarRegla>[1];
    }) => actualizarRegla(codigo, cambios),
    onSuccess: (r) => {
      cliente.setQueryData<Regla[]>(['admin', 'reglas'], (d) =>
        d?.map((x) => (x.codigo === r.codigo ? r : x)),
      );
      setResultados((s) => ({
        ...s,
        [r.codigo]: { tipo: 'exito', mensaje: 'Cambios guardados.' },
      }));
    },
    onError: (e, { codigo }) => {
      const mensaje = mensajeDeError(e);
      const regla = reglas.data?.find((x) => x.codigo === codigo);
      // El mensaje de la API nombra el parámetro inválido: se muestra junto a ese campo.
      const parametro = regla?.descripcion.find((d) => mensaje.includes(d.nombre))?.nombre;
      setResultados((s) => ({ ...s, [codigo]: { tipo: 'error', mensaje, parametro } }));
    },
  });

  return (
    <section aria-labelledby="titulo-reglas" className="flex flex-col gap-5">
      <header>
        <h1 id="titulo-reglas" className="font-display text-2xl font-bold">
          Reglas de compatibilidad
        </h1>
        <p className="text-sm text-text-muted">
          Los cambios aplican a la siguiente validación del armador, el carrito y el asistente.
        </p>
      </header>
      {reglas.isPending ? (
        <div className="grid gap-4" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : reglas.isError ? (
        <EstadoError
          mensaje={mensajeDeError(reglas.error, 'No se pudieron cargar las reglas.')}
          onReintentar={() => reglas.refetch()}
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {reglas.data.map((r) => (
            <TarjetaRegla
              key={`${r.codigo}-${r.activa}-${JSON.stringify(r.parametros)}`}
              regla={r}
              guardando={guardar.isPending && guardar.variables?.codigo === r.codigo}
              resultado={resultados[r.codigo] ?? null}
              onGuardar={(cambios) => {
                setResultados(({ [r.codigo]: _, ...resto }) => resto);
                guardar.mutate({ codigo: r.codigo, cambios });
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
