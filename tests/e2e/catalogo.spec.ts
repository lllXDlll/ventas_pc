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
  await page.waitForLoadState('networkidle'); // React reaplica el valor inicial al hidratar
  await page.getByLabel('Categoría', { exact: true }).selectOption('RAM');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/categoria=RAM/);
  const tarjetas = page.getByRole('article');
  await expect(tarjetas.first()).toBeVisible();
  for (const texto of await tarjetas.allTextContents()) expect(texto).toContain('Memoria RAM');
});

test('@humo el filtro por precio respeta el rango', async ({ page }) => {
  await page.goto('/catalogo?precioMin=100&precioMax=300');
  // Si la precarga del servidor tarda, los productos llegan desde el navegador.
  await expect(page.getByRole('article').first()).toBeVisible();
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

// Sprint 1.5: filtros en la URL, búsqueda desde la cabecera y estados vacío y de error.

test('@humo la marca elegida queda en la URL, como chip, y sobrevive a la recarga', async ({
  page,
}) => {
  await page.goto('/catalogo?categoria=PROCESADOR');
  await page.waitForLoadState('networkidle');
  // La URL se actualiza en una transición: se comprueba el estado con expect, no con check().
  await page.getByRole('checkbox', { name: /AMD/ }).click();
  await expect(page.getByRole('checkbox', { name: /AMD/ })).toBeChecked();
  await expect(page).toHaveURL(/marca=AMD/);
  await expect(page).toHaveURL(/categoria=PROCESADOR/);
  const verificar = async () => {
    // Mientras llega la consulta nueva se muestran los resultados anteriores.
    await expect
      .poll(async () =>
        (await page.getByRole('article').allTextContents()).every((t) => t.includes('AMD')),
      )
      .toBe(true);
    await expect(page.getByRole('article').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quitar filtro AMD' })).toBeVisible();
  };
  await verificar();
  await page.reload();
  await verificar();
});

test('@humo el buscador de la cabecera lleva al catálogo con la búsqueda', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Buscar productos' }).fill('ryzen');
  await page.getByRole('searchbox', { name: 'Buscar productos' }).press('Enter');
  await expect(page).toHaveURL(/\/catalogo\?q=ryzen/);
  const tarjetas = page.getByRole('article');
  await expect(tarjetas.first()).toBeVisible();
  for (const t of await tarjetas.allTextContents()) expect(t.toLowerCase()).toContain('ryzen');
});

test('@humo filtros sin resultados muestran el estado vacío con "Limpiar filtros"', async ({
  page,
}) => {
  await page.goto('/catalogo?q=no-existe-ningun-producto-asi');
  await expect(page.getByText('No hay productos con estos filtros')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros' }).last().click();
  await expect(page).toHaveURL(/\/catalogo$/);
  await expect(page.getByRole('article').first()).toBeVisible();
});

test('con la API caída el catálogo muestra el error y "Reintentar"', async ({ page }) => {
  await page.goto('/catalogo');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('article').first()).toBeVisible();
  // Desde aquí, las consultas del navegador a /productos fallan con 500.
  await page.route(/\/productos\?/, (ruta) =>
    ruta.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"codigo":"ERROR_INTERNO","mensaje":"Ocurrió un error inesperado. Intenta de nuevo."}',
    }),
  );
  await page.getByLabel('Ordenar por').selectOption('precio_desc');
  await expect(page.locator('main').getByRole('alert')).toContainText('Ocurrió un error');
  await page.unroute(/\/productos\?/);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('article').first()).toBeVisible();
});
