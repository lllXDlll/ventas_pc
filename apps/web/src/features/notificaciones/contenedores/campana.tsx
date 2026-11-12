'use client';

import { Campana } from '../components/campana';
import { useMarcarLeida, useNotificaciones } from '../hooks/use-notificaciones';

/** Campana de la cabecera (slot del Header): no se muestra sin sesión. */
export function NotificacionesCabecera() {
  const { data } = useNotificaciones();
  const marcar = useMarcarLeida();
  if (!data) return null;
  return (
    <Campana
      notificaciones={data.notificaciones}
      noLeidas={data.noLeidas}
      marcando={marcar.isPending}
      onMarcar={(id) => marcar.mutate(id)}
    />
  );
}
