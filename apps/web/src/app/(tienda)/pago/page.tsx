import type { Metadata } from 'next';
import { PagoContenedor } from '@/features/carrito/contenedores/pago';

export const metadata: Metadata = { title: 'Pago', robots: { index: false } };

/** Pago simulado de la reserva activa (spec pagos). Solo de cliente: exige sesión. */
export default function Pago() {
  return <PagoContenedor />;
}
