'use client';

import { ShoppingBag, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EstadoError, EstadoVacio } from '@/components/ui/estado';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorApi, mensajeDeError } from '@/lib/api-client';
import { useRedirigirSinSesion } from '@/lib/sesion-requerida';
import type { Revalidacion } from '../api';
import {
  Paginacion,
  TablaCompras,
  TarjetaConfiguracion,
  VistaComprobante,
  VistaDetalleCompra,
} from '../components/historial';
import {
  useCompra,
  useCompras,
  useComprobante,
  useConfiguracionesHistorial,
  useRevalidar,
} from '../hooks/use-historial';

// Pantallas del historial y del comprobante (specs historial y comprobantes). Todas exigen
// sesión: un 401 lleva a /ingresar y vuelve aquí.

function Pagina({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="contenedor flex flex-col gap-6 py-6">
      <h1 className="text-3xl print:hidden">{titulo}</h1>
      {children}
    </div>
  );
}

/** Carga, error (incluido el 404 de algo ajeno) o sin sesión; null si hay datos. */
function estado(
  q: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown },
  sinSesion: boolean,
  noExiste: string,
) {
  if (sinSesion || q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError) {
    if (q.error instanceof ErrorApi && q.error.estado === 404) {
      return (
        <EstadoVacio
          titulo={noExiste}
          accion={
            <Button asChild variante="contorno">
              <Link href="/cuenta/compras">Ir a mis compras</Link>
            </Button>
          }
        />
      );
    }
    return <EstadoError mensaje={mensajeDeError(q.error)} onReintentar={() => void q.refetch()} />;
  }
  return null;
}

export function ComprasContenedor() {
  const [pagina, setPagina] = useState(1);
  const q = useCompras(pagina);
  const sinSesion = useRedirigirSinSesion(q.error);
  return (
    <Pagina titulo="Mis compras">
      {estado(q, sinSesion, 'No encontramos tus compras') ??
        (q.data!.total === 0 ? (
          <EstadoVacio
            titulo="Todavía no tienes compras"
            descripcion="Cuando pagues una reserva, tu compra y su comprobante aparecerán aquí."
            accion={
              <Button asChild>
                <Link href="/catalogo">
                  <ShoppingBag strokeWidth={1.5} /> Ver catálogo
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <TablaCompras compras={q.data!.elementos} />
            <Paginacion pagina={pagina} total={q.data!.total} onCambiar={setPagina} />
          </>
        ))}
    </Pagina>
  );
}

export function CompraContenedor({ id }: { id: string }) {
  const q = useCompra(id);
  const sinSesion = useRedirigirSinSesion(q.error);
  return (
    <Pagina titulo="Detalle de la compra">
      {estado(q, sinSesion, 'Esta compra no existe') ?? <VistaDetalleCompra compra={q.data!} />}
    </Pagina>
  );
}

export function ComprobanteContenedor({ id, nueva }: { id: string; nueva: boolean }) {
  const q = useComprobante(id);
  const sinSesion = useRedirigirSinSesion(q.error);
  return (
    <Pagina titulo="Comprobante">
      {estado(q, sinSesion, 'Este comprobante no existe') ?? (
        <VistaComprobante comprobante={q.data!} nueva={nueva} onImprimir={() => window.print()} />
      )}
    </Pagina>
  );
}

export function ConfiguracionesContenedor() {
  const [pagina, setPagina] = useState(1);
  const q = useConfiguracionesHistorial(pagina);
  const sinSesion = useRedirigirSinSesion(q.error);
  const revalidar = useRevalidar();
  const [resultados, setResultados] = useState<Record<string, Revalidacion>>({});
  return (
    <Pagina titulo="Mis configuraciones">
      {estado(q, sinSesion, 'No encontramos tus configuraciones') ??
        (q.data!.total === 0 ? (
          <EstadoVacio
            titulo="Todavía no guardaste configuraciones"
            descripcion="Arma tu PC y guárdala para retomarla cuando quieras."
            accion={
              <Button asChild>
                <Link href="/armador">
                  <Wrench strokeWidth={1.5} /> Arma tu PC
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            {revalidar.isError && (
              <p role="alert" className="text-sm text-danger">
                {mensajeDeError(revalidar.error, 'No se pudo revalidar.')}
              </p>
            )}
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
              {q.data!.elementos.map((c) => (
                <TarjetaConfiguracion
                  key={c.id}
                  configuracion={c}
                  revalidando={revalidar.isPending && revalidar.variables === c.id}
                  resultado={resultados[c.id] ?? null}
                  onRevalidar={() =>
                    revalidar.mutate(c.id, {
                      onSuccess: (r) => setResultados((prev) => ({ ...prev, [c.id]: r })),
                    })
                  }
                />
              ))}
            </ul>
            <Paginacion pagina={pagina} total={q.data!.total} onCambiar={setPagina} />
          </>
        ))}
    </Pagina>
  );
}
