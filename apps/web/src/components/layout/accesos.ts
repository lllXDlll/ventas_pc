import { Monitor, Sparkles, Tag, Wrench } from 'lucide-react';

/** Accesos rápidos: los que no tienen href son de sprints futuros ("Disponible pronto").
 * "Arma tu PC" funciona desde el Sprint 2 (armador manual) y "Armador IA" desde el Sprint 5. */
export const ACCESOS = [
  { texto: 'Armador IA', icono: Sparkles, href: '/asistente' },
  { texto: 'Arma tu PC', icono: Wrench, href: '/armador' },
  { texto: 'Equipos armados', icono: Monitor, href: '/catalogo?categoria=EQUIPO_ARMADO' },
  { texto: 'Ofertas', icono: Tag, href: null },
] as const;
