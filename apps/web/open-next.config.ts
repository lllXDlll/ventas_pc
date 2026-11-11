// Configuración de OpenNext para Cloudflare (design.md D8).
// Sin caché incremental en R2: R2 está fuera del stack acordado y el frontend
// renderiza por petición (catálogo y stock deben ser siempre actuales).
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});
