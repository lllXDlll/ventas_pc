// Asistente de IA en el navegador (spec asistente; tarea 5.1 del Sprint 5). La API corre con
// IA_PROVEEDOR=simulado y ASISTENTE_LIMITE_24H=3 (playwright.config.ts): sin red ni costo.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { clienteConSesion } from './datos';

const recomendacion = (page: Page) => page.getByRole('region', { name: 'Recomendación' });
const formulario = (page: Page) => page.getByRole('form', { name: 'Pedir una recomendación' });

async function pedir(page: Page, presupuesto: string, uso = 'Gaming') {
  await formulario(page).getByLabel('Presupuesto (S/)').fill(presupuesto);
  await formulario(page)
    .getByRole('radio', { name: new RegExp(`^${uso}`) })
    .check();
  await formulario(page).getByRole('button', { name: 'Recomendar mi PC' }).click();
}

async function abrirAsistente(page: Page) {
  await page.goto('/asistente');
  await expect(formulario(page)).toBeVisible();
  await page.waitForLoadState('networkidle'); // el formulario necesita la página hidratada
}

test('recomendar, ver las explicaciones y agregar al carrito', async ({ page }) => {
  await clienteConSesion(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Arma tu PC con IA' }).click();
  await expect(page).toHaveURL(/\/asistente$/);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Te quedan 3 de 3 consultas')).toBeVisible();

  await pedir(page, '6000');
  const r = recomendacion(page);
  await expect(r.getByText('Recomendada por IA')).toBeVisible();
  const componentes = r
    .getByRole('list', { name: 'Componentes recomendados' })
    .getByRole('listitem');
  await expect(componentes).toHaveCount(7);
  await expect(componentes.first()).toContainText('Recomendación simulada');
  await expect(page.getByText('Te quedan 2 de 3 consultas')).toBeVisible();

  await r.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page).toHaveURL(/\/carrito$/);
  await expect(page.getByRole('list', { name: 'Productos del carrito' })).toContainText(
    'Configuración armada',
  );
});

test('"Editar en el armador" abre la recomendación con la insignia de origen', async ({ page }) => {
  await clienteConSesion(page);
  await abrirAsistente(page);
  await pedir(page, '4500', 'Oficina');
  await recomendacion(page).getByRole('link', { name: 'Editar en el armador' }).click();
  await expect(page).toHaveURL(/\/armador\?/);
  const resumen = page.getByRole('complementary', { name: 'Resumen del armado' });
  await expect(resumen.getByText('Recomendada por IA')).toBeVisible();
  await expect(resumen).toContainText('Oficina');
  await expect(resumen.getByText('Todo es compatible')).toBeVisible();
});

test('si la IA falla, se muestra la recomendación de respaldo', async ({ page }) => {
  await clienteConSesion(page);
  // Escenario del proveedor simulado (solo se honra con IA_PROVEEDOR=simulado).
  await page.route('**/asistente/recomendar', (ruta) =>
    ruta.continue({ headers: { ...ruta.request().headers(), 'x-ia-simulado': 'caida' } }),
  );
  await abrirAsistente(page);
  await pedir(page, '5000', 'Estudio');
  const r = recomendacion(page);
  await expect(r.getByText('Recomendación de respaldo (sin IA)')).toBeVisible();
  await expect(
    r.getByRole('list', { name: 'Componentes recomendados' }).getByRole('listitem'),
  ).toHaveCount(7);
  await expect(r.getByRole('button', { name: 'Agregar al carrito' })).toBeEnabled();
});

test('presupuesto insuficiente y límite alcanzado', async ({ page }) => {
  await clienteConSesion(page);
  await abrirAsistente(page);
  await pedir(page, '300');
  await expect(formulario(page).getByRole('alert')).toContainText('cuesta desde S/');
  // El 422 no gasta cupo: siguen las 3 consultas.
  await expect(page.getByText('Te quedan 3 de 3 consultas')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await pedir(page, '5000');
    await expect(recomendacion(page)).toBeVisible();
  }
  await expect(page.getByText('Te quedan 0 de 3 consultas')).toBeVisible();
  await pedir(page, '5000');
  await expect(formulario(page).getByRole('alert')).toContainText('Vuelves a tener a las');
});

test('@humo sin sesión, /asistente pide iniciar sesión', async ({ page }) => {
  await page.goto('/asistente');
  await expect(page).toHaveURL(/\/ingresar\?volver=%2Fasistente$/);
});

test('accesibilidad y 360 px de /asistente con una recomendación', async ({ page }) => {
  await clienteConSesion(page);
  await abrirAsistente(page);
  await pedir(page, '6000');
  await expect(recomendacion(page)).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
});
