import type { NextConfig } from 'next';

// Sin cacheComponents ni partialPrefetching (activados por la plantilla de Next 16.4):
// el Partial Prerender necesita retomar el render desde una caché incremental, y
// OpenNext está configurado sin caché (open-next.config.ts). Con ellos activados,
// el render en Workers se colgaba. Las páginas se renderizan por petición.
const nextConfig: NextConfig = {
  // P3: el dominio principal es xdtech.store; www redirige de forma permanente.
  async redirects() {
    return [
      {
        source: '/:ruta*',
        has: [{ type: 'host', value: 'www.xdtech.store' }],
        destination: 'https://xdtech.store/:ruta*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
