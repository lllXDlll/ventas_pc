'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { crearQueryClient } from '@/lib/query-client';

/** Un QueryClient por navegador (design D4 del Sprint 1.5). */
export function Providers({ children }: { children: ReactNode }) {
  const [cliente] = useState(crearQueryClient);
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
