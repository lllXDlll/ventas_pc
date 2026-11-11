// Sistema de diseño y vitrina interna (specs sistema-diseno y arquitectura-frontend).
import { expect, test } from '@playwright/test';

test('@humo la vitrina /dev/ui muestra los componentes base y no se indexa', async ({ page }) => {
  await page.goto('/dev/ui');
  await expect(page.getByRole('heading', { name: 'Vitrina de componentes' })).toBeVisible();
  for (const nombre of ['Primario', 'Secundario', 'Fantasma', 'Arma tu PC con IA']) {
    await expect(page.getByRole('button', { name: nombre })).toBeVisible();
  }
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
