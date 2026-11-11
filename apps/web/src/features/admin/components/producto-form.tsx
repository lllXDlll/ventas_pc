'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input, Select } from '@/components/ui/input';
import {
  ATRIBUTOS,
  CATEGORIAS,
  type CodigoCategoria,
  etiquetaAtributo,
  NOMBRES_CATEGORIA,
} from '@/lib/atributos';
import { ICONO_CATEGORIA } from '@/lib/iconos-categoria';
import { urlImagen } from '@/lib/imagen';
import type { ProductoAdmin } from '@/lib/tipos';
import { type DatosProducto, erroresAtributos, errorImagen, esquemaProducto } from '../schemas';

// Formulario de producto (presentación): alta y edición, con los campos técnicos de la
// categoría elegida. Valida en línea y delega el envío.

const valorTexto = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));

/** Campos técnicos que cambian según la categoría (socket, tipo de RAM, vatios…). */
function AtributosFields({
  categoria,
  registrar,
  errores,
}: {
  categoria: CodigoCategoria;
  registrar: (nombre: string) => object;
  errores: Record<string, string>;
}) {
  const campos = Object.entries(ATRIBUTOS[categoria]);
  if (campos.length === 0) {
    return (
      <p className="text-sm text-text-muted">Esta categoría no tiene atributos obligatorios.</p>
    );
  }
  return (
    <fieldset className="grid gap-3 md:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">Datos técnicos</legend>
      {campos.map(([nombre, tipo]) => (
        <FormField
          key={`${categoria}-${nombre}`}
          etiqueta={etiquetaAtributo(nombre)}
          ayuda={tipo === 'lista' ? 'Separados por comas.' : undefined}
          error={errores[nombre]}
        >
          <Input inputMode={tipo === 'entero' ? 'numeric' : undefined} {...registrar(nombre)} />
        </FormField>
      ))}
    </fieldset>
  );
}

export function ProductoForm({
  producto,
  onEnviar,
  enviando,
  error,
}: {
  /** Sin producto: alta. Con producto: edición (la categoría y el stock no se editan aquí). */
  producto?: ProductoAdmin;
  onEnviar: (datos: DatosProducto) => void;
  enviando: boolean;
  error: string | null;
}) {
  const edicion = Boolean(producto);
  const { descripcion, ...tecnicos } = producto?.atributos ?? {};
  const { register, handleSubmit, watch, formState } = useForm<DatosProducto>({
    resolver: zodResolver(esquemaProducto),
    mode: 'onTouched',
    defaultValues: {
      nombre: producto?.nombre ?? '',
      marca: producto?.marca ?? '',
      categoria: (producto?.categoria.codigo as CodigoCategoria) ?? 'PROCESADOR',
      precio: producto?.precio ?? '',
      stockInicial: producto ? String(producto.stock.cantidad) : '0',
      activo: producto?.activo ?? true,
      descripcion: valorTexto(descripcion),
      atributos: Object.fromEntries(Object.entries(tecnicos).map(([k, v]) => [k, valorTexto(v)])),
    },
  });
  const categoria = watch('categoria');
  const [erroresTecnicos, setErroresTecnicos] = useState<Record<string, string>>({});
  const e = formState.errors;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((datos) => {
        const errores = erroresAtributos(datos.categoria, datos.atributos);
        setErroresTecnicos(errores);
        if (Object.keys(errores).length === 0) onEnviar(datos);
      })}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <FormField etiqueta="Nombre" error={e.nombre?.message} className="md:col-span-2">
          <Input maxLength={200} {...register('nombre')} />
        </FormField>
        <FormField etiqueta="Marca" error={e.marca?.message}>
          <Input maxLength={60} {...register('marca')} />
        </FormField>
        {edicion ? (
          // La categoría no se edita: un select deshabilitado no llegaría al formulario.
          <FormField etiqueta="Categoría" ayuda="No se puede cambiar.">
            <Input readOnly value={NOMBRES_CATEGORIA[categoria]} />
          </FormField>
        ) : (
          <FormField etiqueta="Categoría">
            <Select {...register('categoria')}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {NOMBRES_CATEGORIA[c]}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField etiqueta="Precio (S/)" error={e.precio?.message}>
          <Input inputMode="decimal" placeholder="1299.90" {...register('precio')} />
        </FormField>
        {edicion ? (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" {...register('activo')} />
            Activo (visible en el catálogo)
          </label>
        ) : (
          <FormField etiqueta="Stock inicial" error={e.stockInicial?.message}>
            <Input type="number" min={0} step={1} {...register('stockInicial')} />
          </FormField>
        )}
      </div>
      <AtributosFields
        categoria={categoria}
        registrar={(nombre) => register(`atributos.${nombre}`)}
        errores={erroresTecnicos}
      />
      <FormField etiqueta="Descripción (opcional)">
        <Input {...register('descripcion')} />
      </FormField>
      {error && (
        <p
          role="alert"
          className="rounded-control border border-danger/40 bg-surface p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? 'Guardando…' : edicion ? 'Guardar cambios' : 'Crear producto'}
      </Button>
    </form>
  );
}

/** Imagen del producto: vista previa, subida (JPEG, PNG o WebP, hasta 2 MB) y borrado. */
export function ImagenEditor({
  producto,
  onSubir,
  onQuitar,
  ocupado,
  error,
}: {
  producto: ProductoAdmin;
  onSubir: (archivo: File) => void;
  onQuitar: () => void;
  ocupado: boolean;
  error: string | null;
}) {
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const url = urlImagen(producto.imagenUrl);
  const Icono = ICONO_CATEGORIA[producto.categoria.codigo];
  const mensaje = errorLocal ?? error;
  return (
    <section
      className="flex flex-col gap-3 border-t border-border pt-4"
      aria-label="Imagen del producto"
    >
      <h3 className="text-sm font-medium">Imagen (opcional)</h3>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 items-center justify-center overflow-hidden rounded-card bg-image-bg">
          {url ? (
            <img
              src={url}
              alt={`Imagen de ${producto.nombre}`}
              className="size-full object-contain p-2"
            />
          ) : (
            <Icono className="size-10 text-image-icon" strokeWidth={1.5} aria-label="Sin imagen" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-control border border-border px-3 text-sm hover:border-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-soft">
            <ImagePlus className="size-4" strokeWidth={1.5} aria-hidden="true" />
            {url ? 'Reemplazar imagen' : 'Subir imagen'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={ocupado}
              onChange={(ev) => {
                const archivo = ev.target.files?.[0];
                ev.target.value = '';
                if (!archivo) return;
                const problema = errorImagen(archivo);
                setErrorLocal(problema);
                if (!problema) onSubir(archivo);
              }}
            />
          </label>
          {url && (
            <Button
              type="button"
              variante="peligro"
              tamano="sm"
              disabled={ocupado}
              onClick={onQuitar}
            >
              <Trash2 strokeWidth={1.5} /> Quitar imagen
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-text-muted">JPEG, PNG o WebP, hasta 2 MB.</p>
      {mensaje && (
        <p role="alert" className="text-sm text-danger">
          {mensaje}
        </p>
      )}
    </section>
  );
}
