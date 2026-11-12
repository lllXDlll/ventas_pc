'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Gráfico de barras de los reportes (spec reportes, design D4 del Sprint 6). Se carga con
// next/dynamic solo en las rutas de reportes. Es decorativo para lectores de pantalla:
// la tabla que lo acompaña lleva los mismos datos.

export interface Barra {
  etiqueta: string;
  valor: number;
}

export default function GraficoBarras({
  datos,
  serie,
  formato = (v) => String(v),
}: {
  datos: Barra[];
  serie: string;
  formato?: (valor: number) => string;
}) {
  return (
    <div aria-hidden="true" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={datos}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          // Sin capa de teclado: el gráfico está oculto a la tecnología de apoyo y la tabla
          // lleva los datos (sin elementos enfocables dentro de aria-hidden).
          accessibilityLayer={false}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="etiqueta"
            stroke="var(--text-muted)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="var(--text-muted)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickFormatter={formato}
            tickLine={false}
            axisLine={false}
            width={72}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface)' }}
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-control)',
              color: 'var(--text)',
            }}
            labelStyle={{ color: 'var(--text-muted)' }}
            formatter={(v) => [formato(Number(v)), serie]}
          />
          <Bar dataKey="valor" name={serie} fill="var(--primary-soft)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
