// Secretos del Worker que `wrangler types` no ve (no están en vars): se cargan con
// `wrangler secret put` (design D9 del Sprint 5).
declare namespace Cloudflare {
  interface Env {
    /** URL de AI Gateway para Anthropic: https://gateway.ai.cloudflare.com/v1/<cuenta>/<gateway>/anthropic */
    IA_GATEWAY_URL?: string;
    /** Token del gateway autenticado (encabezado cf-aig-authorization). */
    CF_AIG_TOKEN?: string;
  }
}
