import type { NextConfig } from 'next';

// Sin cacheComponents ni partialPrefetching (activados por la plantilla de Next 16.4):
// el Partial Prerender necesita retomar el render desde una caché incremental, y
// OpenNext está configurado sin caché (open-next.config.ts). Con ellos activados,
// el render en Workers se colgaba. Las páginas se renderizan por petición.
const nextConfig: NextConfig = {};

export default nextConfig;
