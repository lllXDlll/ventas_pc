'use client';

import { Save } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EstadoError } from '@/components/ui/estado';
import { mensajeDeError } from '@/lib/api-client';
import { useAgregarAlCarrito } from '@/lib/carrito';
import type { CodigoCategoria } from '@/lib/atributos';
import type { Producto } from '@/lib/tipos';
import { type Item, sinSesion } from '../api';
import {
  BotonCarritoArmado,
  type Elegido,
  ListaRechazos,
  PasoCategoria,
  InsigniaAsistente,
  ResumenArmado,
} from '../components/armador';
import {
  useConfiguracion,
  useGuardarConfiguracion,
  useProductosDeCategoria,
  useProductosElegidos,
  useValidacion,
} from '../hooks/use-armador';
import { leerSeleccion, MULTIPLES, PASOS, urlArmador } from '../seleccion';

/** La URL es el estado: se actualiza sin volver a renderizar en el servidor. */
const navegar = (url: string) => window.history.replaceState(null, '', url);

function Paso({
  categoria,
  abierto,
  ...resto
}: Omit<
  Parameters<typeof PasoCategoria>[0],
  'productos' | 'cargando' | 'error' | 'onReintentar'
> & { categoria: CodigoCategoria }) {
  const lista = useProductosDeCategoria(categoria, abierto);
  return (
    <PasoCategoria
      categoria={categoria}
      abierto={abierto}
      productos={lista.data?.productos}
      cargando={lista.isPending}
      error={
        lista.isError ? mensajeDeError(lista.error, 'No se pudieron cargar los productos.') : null
      }
      onReintentar={() => void lista.refetch()}
      {...resto}
    />
  );
}

/** Armador manual (spec armador): pasos por categoría, validación en vivo y guardado. */
export function ArmadorContenedor() {
  const router = useRouter();
  const params = useSearchParams();
  const items = useMemo(() => leerSeleccion(params.get('p')), [params]);
  const config = params.get('config');

  // Retomar una configuración guardada: si la URL solo trae config=, se cargan sus productos.
  const guardada = useConfiguracion(items.length === 0 ? config : null);
  // Origen, presupuesto y uso de la configuración abierta (comparte caché con la anterior).
  const abierta = useConfiguracion(config);
  useEffect(() => {
    if (guardada.data && items.length === 0) {
      navegar(
        urlArmador(
          guardada.data.items.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad })),
          guardada.data.id,
        ),
      );
    }
  }, [guardada.data, items.length]);

  const consultas = useProductosElegidos(items);
  const porId = new Map<string, Producto>();
  consultas.forEach((c) => c.data && porId.set(c.data.id, c.data));
  const elegidos: Elegido[] = items.map((i) => ({ ...i, producto: porId.get(i.productoId) }));
  const deCategoria = (c: CodigoCategoria) =>
    elegidos.filter((e) => e.producto?.categoria.codigo === c);

  const validacion = useValidacion(items);
  const rechazos = validacion.data?.rechazos ?? [];
  const conflictos = new Set(rechazos.flatMap((r) => r.productos));

  const primeroSinElegir = PASOS.find((c) => deCategoria(c).length === 0) ?? PASOS[0];
  // null: automático (el primer paso sin elegir si no hay nada); 'ninguno': todos cerrados.
  const [abierto, setAbierto] = useState<CodigoCategoria | 'ninguno' | null>(null);
  const pasoAbierto = abierto ?? (items.length ? 'ninguno' : primeroSinElegir);

  const guardar = useGuardarConfiguracion();
  const alCarrito = useAgregarAlCarrito();
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiar = (nuevos: Item[]) => {
    setAviso(null);
    navegar(urlArmador(nuevos, config));
  };
  const elegir = (p: Producto) => {
    const categoria = p.categoria.codigo;
    const multiple = MULTIPLES.includes(categoria);
    const base = multiple
      ? items
      : items.filter((i) => porId.get(i.productoId)?.categoria.codigo !== categoria);
    cambiar([...base, { productoId: p.id, cantidad: 1 }]);
    if (!multiple) {
      const siguiente = PASOS.find((c) => c !== categoria && deCategoria(c).length === 0);
      setAbierto(siguiente ?? 'ninguno');
    }
  };

  const total = elegidos
    .reduce((s, e) => s + (e.producto ? Number(e.producto.precio) * e.cantidad : 0), 0)
    .toFixed(2);
  const sinStock = elegidos.some((e) => e.producto && e.producto.disponible < e.cantidad);
  const compatible = items.length ? validacion.data?.compatible : undefined;
  const agregable = Boolean(compatible) && items.length > 0 && !sinStock;
  const motivo =
    items.length === 0
      ? 'Elige al menos un componente.'
      : compatible === false
        ? 'Resuelve las incompatibilidades para continuar.'
        : sinStock
          ? 'Hay productos sin stock suficiente.'
          : 'Validando…';

  const onGuardar = () =>
    guardar.mutate(
      { id: config, items },
      {
        onSuccess: (v) => {
          navegar(urlArmador(items, v.id));
          setAviso(config ? 'Cambios guardados.' : 'Configuración guardada.');
        },
        onError: (e) => {
          if (sinSesion(e)) {
            router.push(`/ingresar?volver=${encodeURIComponent(urlArmador(items, config))}`);
            return;
          }
          setAviso(mensajeDeError(e, 'No se pudo guardar la configuración.'));
        },
      },
    );

  // Agregar al carrito: guarda (o actualiza) la configuración y la agrega como un ítem.
  const onAgregarAlCarrito = () =>
    guardar.mutate(
      { id: config, items },
      {
        onSuccess: (v) => {
          navegar(urlArmador(items, v.id));
          alCarrito.mutate(
            { configuracionId: v.id },
            {
              onSuccess: () => router.push('/carrito'),
              onError: (e) => setAviso(mensajeDeError(e, 'No se pudo agregar al carrito.')),
            },
          );
        },
        onError: (e) => {
          if (sinSesion(e)) {
            router.push(`/ingresar?volver=${encodeURIComponent(urlArmador(items, config))}`);
            return;
          }
          setAviso(mensajeDeError(e, 'No se pudo guardar la configuración.'));
        },
      },
    );

  return (
    <div className="contenedor flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl">Arma tu PC</h1>
        <p className="text-text-muted">
          Elige un componente por categoría. Validamos la compatibilidad en cada cambio.
        </p>
      </header>
      {guardada.isError && (
        <EstadoError
          mensaje={mensajeDeError(guardada.error, 'No se pudo abrir la configuración.')}
        />
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-3">
          {PASOS.map((c) => (
            <Paso
              key={c}
              categoria={c}
              multiple={MULTIPLES.includes(c)}
              abierto={pasoAbierto === c}
              onAlternar={() => setAbierto(pasoAbierto === c ? 'ninguno' : c)}
              elegidos={deCategoria(c)}
              conflictos={conflictos}
              onElegir={elegir}
              onQuitar={(id) => cambiar(items.filter((i) => i.productoId !== id))}
              onCantidad={(id, cantidad) =>
                cambiar(items.map((i) => (i.productoId === id ? { ...i, cantidad } : i)))
              }
            />
          ))}
        </div>
        <ResumenArmado
          origen={
            abierta.data?.origen === 'IA' ? (
              <InsigniaAsistente presupuesto={abierta.data.presupuesto} uso={abierta.data.uso} />
            ) : null
          }
          elegidos={elegidos}
          total={total}
          compatibilidad={
            validacion.isError ? (
              <EstadoError
                mensaje={mensajeDeError(validacion.error, 'No se pudo validar la configuración.')}
                onReintentar={() => void validacion.refetch()}
              />
            ) : (
              <ListaRechazos
                rechazos={rechazos}
                compatible={compatible}
                validando={validacion.isFetching}
                vacio={items.length === 0}
              />
            )
          }
          aviso={
            <p role="status" className="text-sm text-success empty:hidden">
              {aviso ?? ''}
            </p>
          }
          acciones={
            <>
              <Button
                type="button"
                onClick={onGuardar}
                disabled={items.length === 0 || guardar.isPending}
              >
                <Save strokeWidth={1.5} />
                {guardar.isPending ? 'Guardando…' : config ? 'Guardar cambios' : 'Guardar armado'}
              </Button>
              <BotonCarritoArmado
                agregable={agregable}
                motivo={motivo}
                ocupado={guardar.isPending || alCarrito.isPending}
                onAgregar={onAgregarAlCarrito}
              />
            </>
          }
        />
      </div>
    </div>
  );
}
