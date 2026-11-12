'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { esSinSesion } from '@/lib/sesion-requerida';
import type { Uso } from '@/lib/usos';
import { limite, recomendar } from '../api';

const CLAVE_LIMITE = ['asistente', 'limite'] as const;

export const useLimite = () =>
  useQuery({
    queryKey: CLAVE_LIMITE,
    queryFn: limite,
    retry: (n, e) => !esSinSesion(e) && n < 2,
  });

/** Pide una recomendación; al terminar, vuelve a leer las consultas restantes. */
export function useRecomendar() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (v: { presupuesto: number; uso: Uso }) => recomendar(v.presupuesto, v.uso),
    onSettled: () => cliente.invalidateQueries({ queryKey: CLAVE_LIMITE }),
  });
}
