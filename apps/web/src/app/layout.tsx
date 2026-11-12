import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { Footer, Header, TopBar } from '@/components/layout/shell';
import { CuentaCabecera } from '@/features/auth/contenedores/cuenta';
import { CarritoCabecera } from '@/features/carrito/contenedores/carrito';
import { MegaMenuContenedor } from '@/features/catalogo/contenedores/inicio';
import '@/styles/globals.css';
import { Providers } from './providers';

// Fuentes servidas por el propio sitio (next/font), expuestas como variables CSS.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'XDTech · Arma tu PC con compatibilidad validada', template: '%s · XDTech' },
  description:
    'Componentes y equipos armados con stock real y validación de compatibilidad en Ayacucho.',
};

/** Shell de la tienda: la cabecera recibe la cuenta y el mega menú como slots (design D1). */
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <TopBar />
          <Header
            cuenta={<CuentaCabecera />}
            megaMenu={<MegaMenuContenedor />}
            carrito={<CarritoCabecera />}
          />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
