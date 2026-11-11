import { QueryClient } from '@tanstack/react-query';
import { ErrorApi } from './api-client';

/**
 * Cliente de TanStack Query (design D4 del Sprint 1.5): 30 s de frescura, así lo precargado
 * en el servidor no se vuelve a pedir al hidratar, y sin reintentos para los errores 4xx.
 */
export function crearQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (intentos, error) =>
          !(error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) && intentos < 2,
      },
    },
  });
}
