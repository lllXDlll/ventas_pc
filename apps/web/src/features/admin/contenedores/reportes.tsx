'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { EstadoError, EstadoVacio } from '@/components/ui/estado';
import { Skeleton } from '@/components/ui/skeleton';
import { mensajeDeError } from '@/lib/api-client';
import { formatoPrecio } from '@/lib/format';
import { NOMBRES_USO, type Uso } from '@/lib/usos';
import { opcionesReporteAsistente, opcionesReporteVentas, type RangoFechas } from '../api';
import { FiltroFechas, Indicadores, Seccion, Tabla } from '../components/reportes';

// Reportes del panel (spec reportes, design D4 del Sprint 6). El rango vive en la URL y
// Recharts se carga aparte, solo en estas rutas.

const GraficoBarras = dynamic(() => import('../components/grafico-barras'), {
  ssr: false,
  loading: () => <Skeleton className="h-64" />,
});

const MOTIVOS: Record<string, string> = {
  IA_DESACTIVADA: 'IA desactivada',
  IA_SIN_CONFIGURAR: 'Gateway sin configurar',
  IA_SIN_AUTORIZACION: 'Gateway sin autorización',
  IA_NO_DISPONIBLE: 'IA no disponible',
  IA_TIMEOUT: 'Tiempo de espera agotado',
  IA_RECHAZO: 'El modelo rechazó la consulta',
  IA_INVALIDA: 'Respuesta inválida tras el reintento',
  SIN_MOTIVO: 'Sin motivo registrado',
};

const ENTERO = new Intl.NumberFormat('es-PE');
const dia = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
const porcentaje = (n: number) => `${n.toLocaleString('es-PE')} %`;

function useRango(): [RangoFechas, (r: RangoFechas) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  const rango = {
    desde: params.get('desde') ?? undefined,
    hasta: params.get('hasta') ?? undefined,
  };
  const aplicar = (r: RangoFechas) => {
    const q = new URLSearchParams();
    if (r.desde) q.set('desde', r.desde);
    if (r.hasta) q.set('hasta', r.hasta);
    router.replace(q.size ? `${ruta}?${q}` : ruta, { scroll: false });
  };
  return [rango, aplicar];
}

function Marco({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="titulo-reporte" className="flex flex-col gap-5">
      <header>
        <h1 id="titulo-reporte" className="font-display text-2xl font-bold">
          {titulo}
        </h1>
        <p className="text-sm text-text-muted">{descripcion}</p>
      </header>
      {children}
    </section>
  );
}

const Cargando = () => (
  <div className="flex flex-col gap-4" aria-busy="true">
    <Skeleton className="h-24" />
    <Skeleton className="h-64" />
  </div>
);

export function ReporteVentasContenedor() {
  const [rango, aplicar] = useRango();
  const r = useQuery(opcionesReporteVentas(rango));
  return (
    <Marco
      titulo="Reporte de ventas"
      descripcion="Órdenes confirmadas en el rango, en hora de Lima."
    >
      <FiltroFechas rango={r.data?.rango} onAplicar={aplicar} />
      {r.isPending ? (
        <Cargando />
      ) : r.isError ? (
        <EstadoError
          mensaje={mensajeDeError(r.error, 'No se pudo cargar el reporte.')}
          onReintentar={() => r.refetch()}
        />
      ) : (
        <>
          <Indicadores
            items={[
              { etiqueta: 'Total vendido', valor: formatoPrecio(r.data.totalVendido) },
              { etiqueta: 'Órdenes', valor: ENTERO.format(r.data.ordenes) },
              { etiqueta: 'Ticket promedio', valor: formatoPrecio(r.data.ticketPromedio) },
            ]}
          />
          {r.data.ordenes === 0 ? (
            <EstadoVacio
              titulo="No hay ventas en este rango"
              descripcion="Prueba con otras fechas."
            />
          ) : (
            <>
              <Seccion titulo="Ventas por día">
                <GraficoBarras
                  serie="Total vendido"
                  formato={(v) => formatoPrecio(v)}
                  datos={r.data.serie.map((d) => ({
                    etiqueta: dia(d.fecha),
                    valor: Number(d.total),
                  }))}
                />
                <details>
                  <summary className="cursor-pointer text-sm text-text-muted">
                    Ver los datos del gráfico
                  </summary>
                  <div className="mt-3">
                    <Tabla
                      titulo="Ventas por día"
                      columnas={[
                        { etiqueta: 'Día' },
                        { etiqueta: 'Órdenes', numerica: true },
                        { etiqueta: 'Total', numerica: true },
                      ]}
                      filas={r.data.serie.map((d) => [d.fecha, d.ordenes, formatoPrecio(d.total)])}
                    />
                  </div>
                </details>
              </Seccion>
              <Tabla
                titulo="Productos más vendidos"
                columnas={[
                  { etiqueta: 'Producto' },
                  { etiqueta: 'Unidades', numerica: true },
                  { etiqueta: 'Importe', numerica: true },
                ]}
                filas={r.data.productos.map((p) => [
                  p.nombre,
                  ENTERO.format(p.unidades),
                  formatoPrecio(p.importe),
                ])}
              />
            </>
          )}
        </>
      )}
    </Marco>
  );
}

export function ReporteAsistenteContenedor() {
  const [rango, aplicar] = useRango();
  const r = useQuery(opcionesReporteAsistente(rango));
  return (
    <Marco
      titulo="Reporte del asistente"
      descripcion="Consultas al asistente de IA en el rango, en hora de Lima."
    >
      <FiltroFechas rango={r.data?.rango} onAplicar={aplicar} />
      {r.isPending ? (
        <Cargando />
      ) : r.isError ? (
        <EstadoError
          mensaje={mensajeDeError(r.error, 'No se pudo cargar el reporte.')}
          onReintentar={() => r.refetch()}
        />
      ) : (
        <>
          <Indicadores
            items={[
              { etiqueta: 'Consultas', valor: ENTERO.format(r.data.consultas) },
              {
                etiqueta: 'Con respaldo',
                valor: porcentaje(r.data.porcentajeRespaldo),
                nota: `${ENTERO.format(r.data.conRespaldo)} consultas`,
              },
              {
                etiqueta: 'Latencia promedio',
                valor: `${(r.data.latenciaPromedioMs / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} s`,
              },
              {
                etiqueta: 'Costo estimado',
                valor: `US$ ${r.data.costoEstimadoUsd.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`,
                nota: `${ENTERO.format(r.data.tokens.entrada)} tokens de entrada y ${ENTERO.format(r.data.tokens.salida)} de salida, con el precio de ${r.data.modelo}`,
              },
            ]}
          />
          {r.data.consultas === 0 ? (
            <EstadoVacio
              titulo="No hay consultas en este rango"
              descripcion="Prueba con otras fechas."
            />
          ) : (
            <>
              <Seccion titulo="Consultas por uso previsto">
                <GraficoBarras
                  serie="Consultas"
                  datos={r.data.porUso.map((u) => ({
                    etiqueta: NOMBRES_USO[u.uso as Uso] ?? u.uso,
                    valor: u.consultas,
                  }))}
                />
                <Tabla
                  titulo="Consultas por uso previsto"
                  columnas={[
                    { etiqueta: 'Uso' },
                    { etiqueta: 'Consultas', numerica: true },
                    { etiqueta: 'Con respaldo', numerica: true },
                  ]}
                  filas={r.data.porUso.map((u) => [
                    NOMBRES_USO[u.uso as Uso] ?? u.uso,
                    ENTERO.format(u.consultas),
                    porcentaje(u.porcentajeRespaldo),
                  ])}
                />
              </Seccion>
              <Tabla
                titulo="Motivos de respaldo"
                columnas={[{ etiqueta: 'Motivo' }, { etiqueta: 'Consultas', numerica: true }]}
                filas={
                  r.data.motivos.length
                    ? r.data.motivos.map((m) => [
                        MOTIVOS[m.motivo] ?? m.motivo,
                        ENTERO.format(m.consultas),
                      ])
                    : [['Ninguna consulta usó el respaldo', '0']]
                }
              />
            </>
          )}
        </>
      )}
    </Marco>
  );
}
