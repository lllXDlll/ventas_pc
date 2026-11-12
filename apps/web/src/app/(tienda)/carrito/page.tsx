import type { Metadata } from 'next';
import { CarritoContenedor } from '@/features/carrito/contenedores/carrito';

export const metadata: Metadata = { title: 'Carrito', robots: { index: false } };

/** Carrito y reserva (specs carrito y reservas). Solo de cliente: exige sesión. */
export default function Carrito() {
  return <CarritoContenedor />;
}
