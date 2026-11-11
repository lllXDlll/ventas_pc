import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { CabeceraSesion, ProveedorSesion } from './sesion';

export const metadata: Metadata = {
  title: 'xdtech.store',
  description: 'Computadoras y componentes con validación de compatibilidad',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es">
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
