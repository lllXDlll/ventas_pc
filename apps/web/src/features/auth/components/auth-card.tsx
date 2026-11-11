import type { ReactNode } from 'react';

/** Tarjeta centrada sobre un fondo con degradado tenue (pantallas de cuenta). */
export function AuthCard({
  titulo,
  descripcion,
  children,
  pie,
}: {
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  pie?: ReactNode;
}) {
  return (
    <div className="fondo-tenue flex flex-1 items-start justify-center px-4 py-12 md:items-center">
      <section className="w-full max-w-md rounded-card border border-border bg-card p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl">{titulo}</h1>
        {descripcion && <p className="mt-2 text-sm text-text-muted">{descripcion}</p>}
        <div className="mt-6">{children}</div>
        {pie && (
          <div className="mt-6 border-t border-border pt-4 text-sm text-text-muted">{pie}</div>
        )}
      </section>
    </div>
  );
}
