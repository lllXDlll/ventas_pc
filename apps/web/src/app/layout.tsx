import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import Link from 'next/link';
import '@/styles/globals.css';
import { CabeceraSesion, ProveedorSesion } from './sesion';

// Fuentes servidas por el propio sitio (next/font), expuestas como variables CSS.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'xdtech.store',
  description: 'Computadoras y componentes con validación de compatibilidad',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        <ProveedorSesion>
          <header className="cabecera">
            <nav className="fila">
              <Link href="/" className="marca">
                xdtech.store
              </Link>
              <Link href="/catalogo">Catálogo</Link>
            </nav>
            <CabeceraSesion />
          </header>
          <div className="contenido">{children}</div>
        </ProveedorSesion>
      </body>
    </html>
  );
}
