import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'xdtech.store',
  description: 'Computadoras y componentes con validación de compatibilidad',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
