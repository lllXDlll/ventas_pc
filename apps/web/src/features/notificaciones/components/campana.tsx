'use client';

import { Bell, Check, PackageX, Receipt } from 'lucide-react';
import { Popover } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { formatoContador, formatoFecha } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Notificacion } from '../api';

// Campana de notificaciones de la cabecera (spec notificaciones). Presentación pura sobre el
// Popover de Radix: Esc cierra y devuelve el foco a la campana.

const ICONOS: Record<string, typeof Bell> = {
  PRODUCTO_AGOTADO: PackageX,
  COMPRA_CONFIRMADA: Receipt,
};

export function Campana({
  notificaciones,
  noLeidas,
  marcando,
  onMarcar,
}: {
  notificaciones: Notificacion[];
  noLeidas: number;
  marcando: boolean;
  onMarcar: (id: string) => void;
}) {
  const etiqueta =
    noLeidas === 0 ? 'Notificaciones, ninguna sin leer' : `Notificaciones, ${noLeidas} sin leer`;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={etiqueta}
          className="relative inline-flex size-10 items-center justify-center rounded-control hover:bg-card"
        >
          <Bell className="size-5" strokeWidth={1.5} aria-hidden="true" />
          {noLeidas > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] text-on-color"
            >
              {formatoContador(noLeidas)}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          aria-label="Notificaciones"
          className="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-2 shadow-lg"
        >
          <h2 className="px-2 py-1 text-sm font-medium">Notificaciones</h2>
          {notificaciones.length === 0 ? (
            <p className="px-2 py-4 text-sm text-text-muted">No tienes notificaciones.</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {notificaciones.map((n) => {
                const Icono = ICONOS[n.tipo] ?? Bell;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      'flex gap-3 rounded-control p-2 text-sm',
                      n.leida ? 'text-text-muted' : 'bg-card',
                    )}
                  >
                    <Icono
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        n.tipo === 'PRODUCTO_AGOTADO' ? 'text-warning' : 'text-success',
                      )}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p>{n.mensaje}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {formatoFecha(n.creadaEn)}
                        {n.leida ? ' · Leída' : ''}
                      </p>
                    </div>
                    {!n.leida && (
                      <Button
                        type="button"
                        variante="fantasma"
                        tamano="icono"
                        className="size-8 shrink-0"
                        aria-label={`Marcar como leída: ${n.mensaje}`}
                        disabled={marcando}
                        onClick={() => onMarcar(n.id)}
                      >
                        <Check strokeWidth={1.5} />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
