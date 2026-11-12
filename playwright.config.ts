// Pruebas e2e de navegador (design.md D14 del Sprint 1).
// Local y CI: Playwright levanta la API (wrangler dev) y el frontend (next build + start)
// contra el Postgres local o el servicio de la CI. Producción: con E2E_URL corre solo
// contra esa URL, sin levantar nada (usar con --grep @humo: pruebas de solo lectura).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const EXTERNA = process.env.E2E_URL;
const CI = Boolean(process.env.CI);
const API = 'http://localhost:8787';
const WEB = 'http://localhost:3000';

// Estado de los Durable Objects (contadores de límites) en un directorio temporal: no
// pasa de una corrida a otra.
const estado = join(tmpdir(), `xdtech-e2e-${process.pid}`);

// Sin CF-Connecting-IP todas las peticiones comparten la clave "sin-ip": límites altos
// para que la propia suite no reciba 429. COOKIE_DOMAIN vacío: cookie sin Domain ni Secure.
const variablesApi = [
  `FRONTEND_ORIGIN:${WEB}`,
  'COOKIE_DOMAIN:',
  'LIMITE_REGISTRO_MAX:100000',
  'LIMITE_LOGIN_CORREO_MAX:100000',
  'LIMITE_LOGIN_IP_MAX:100000',
  // Asistente (Sprint 5): proveedor simulado, sin red ni costo, y un límite bajo para probarlo.
  'IA_PROVEEDOR:simulado',
  'ASISTENTE_LIMITE_24H:3',
]
  .map((v) => `--var "${v}"`)
  .join(' ');

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: EXTERNA ? undefined : './tests/e2e/preparar.ts',
  use: {
    baseURL: EXTERNA ?? WEB,
    trace: 'retain-on-failure',
    locale: 'es-PE',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: EXTERNA
    ? undefined
    : [
        {
          command: `pnpm --filter api exec wrangler dev --port 8787 --persist-to "${estado}" ${variablesApi}`,
          url: `${API}/health/live`,
          reuseExistingServer: !CI,
          timeout: 180_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
        {
          command: 'pnpm --filter web build && pnpm --filter web exec next start -p 3000',
          url: WEB,
          env: { NEXT_PUBLIC_API_URL: API },
          reuseExistingServer: !CI,
          timeout: 300_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
      ],
});
