// Catálogo público en el navegador (spec catalogo; tarea 5.3). Pruebas @humo: solo leen,
// así que también corren contra producción con E2E_URL=https://xdtech.store.
import { expect, test } from '@playwright/test';
import { ID_AGOTADO } from './datos';

test('@humo el catálogo lista productos con precio y disponibilidad', async ({ page }) => {
  await page.goto('/catalogo');
  await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
  await expect(page.getByText(/\d+ productos disponibles/)).toBeVisible();
  const tarjetas = page.getByRole('article');
  await expect(tarjetas.first()).toBeVisible();
  await expect(tarjetas.first()).toContainText('S/');
  await expect(tarjetas.first()).toContainText(/En stock|Últimas? \d* ?unidad/);
});

test('@humo el filtro por categoría deja solo esa categoría', async ({ page }) => {
  await page.goto('/catalogo');
  await page.getByLabel('Categoría', { exact: true }).selectOption('RAM');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/categoria=RAM/);
  const tarjetas = page.getByRole('article');
  await expect(tarjetas.first()).toBeVisible();
  for (const texto of await tarjetas.allTextContents()) expect(texto).toContain('Memoria RAM');
});

test('@humo el filtro por precio respeta el rango', async ({ page }) => {
  await page.goto('/catalogo?precioMin=100&precioMax=300');
  const precios = await page.getByRole('article').getByText(/^S\/ /).allTextContents();
  expect(precios.length).toBeGreaterThan(0);
  for (const p of precios) {
    const valor = Number(p.replace('S/', '').replace(/,/g, '').trim());
    expect(valor).toBeGreaterThanOrEqual(100);
    expect(valor).toBeLessThanOrEqual(300);
  }
});

test('@humo un producto agotado no aparece en el listado y su detalle lo marca', async ({
  page,
}) => {
  await page.goto('/catalogo?categoria=PROCESADOR');
  await expect(page.locator(`a[href="/catalogo/${ID_AGOTADO}"]`)).toHaveCount(0);
  await page.goto(`/catalogo/${ID_AGOTADO}`);
  await expect(page.getByText('Agotado')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'LGA1700' })).toBeVisible();
});

test('@humo las páginas de cuenta cargan', async ({ page }) => {
  await page.goto('/registro');
  await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
  await page.goto('/ingresar');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});
