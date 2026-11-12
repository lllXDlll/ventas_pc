// Armador manual en el navegador (spec armador; tareas 4.3 a 4.5 y 5.1 del Sprint 2).
// Usa el catálogo de ejemplo (UUID fijos de la semilla).
import { expect, type Page, test } from '@playwright/test';
import { CONTRASENA, correoNuevo, registrar } from './datos';

const id = (n: number) => `0195a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const RYZEN5 = { id: id(1), nombre: 'AMD Ryzen 5 7600' };
const I5 = { id: id(3), nombre: 'Intel Core i5-14400F' };
const B650 = 'MSI B650 Gaming Plus WiFi';
const B760 = 'ASUS Prime B760M-A D4';

const resumen = (page: Page) => page.getByRole('complementary', { name: 'Resumen del armado' });
const elegir = (page: Page, nombre: string) =>
  page.getByRole('button', { name: `Elegir: ${nombre}` }).click();

test('@humo el armador muestra el rechazo de socket en vivo y lo quita al corregir', async ({
  page,
}) => {
  await page.goto('/armador');
  await page.waitForLoadState('networkidle');
  await elegir(page, I5.nombre);
  // Tras elegir el procesador se abre el siguiente paso: placa madre.
  await elegir(page, B650);
  const r = resumen(page);
  await expect(r.getByRole('list', { name: 'Incompatibilidades' })).toContainText('LGA1700');
  await expect(r.getByRole('list', { name: 'Incompatibilidades' })).toContainText('SOCKET');
  await expect(r.getByRole('button', { name: 'Agregar al carrito' })).toBeDisabled();

  await page.getByRole('button', { name: /^Placa madre/ }).click();
  await elegir(page, B760);
  await expect(r.getByText('Todo es compatible')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`p=${I5.id}`));
});

test('guardar sin sesión pide iniciar sesión, conserva la selección y luego guarda', async ({
  page,
}) => {
  const correo = correoNuevo();
  await registrar(page, correo);
  await expect(page.getByText('está lista')).toBeVisible();

  await page.goto(`/armador?p=${RYZEN5.id}:1`);
  await expect(resumen(page)).toContainText(RYZEN5.nombre);
  await resumen(page).getByRole('button', { name: 'Guardar armado' }).click();
  await expect(page).toHaveURL(/\/ingresar\?volver=/);

  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(new RegExp(`/armador\\?p=${RYZEN5.id}`));
  await expect(resumen(page)).toContainText(RYZEN5.nombre);

  await resumen(page).getByRole('button', { name: 'Guardar armado' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Configuración guardada.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/config=[0-9a-f-]{36}/);

  // Retomar solo con config=: se cargan sus productos.
  const config = new URL(page.url()).searchParams.get('config');
  await page.goto(`/armador?config=${config}`);
  await expect(resumen(page)).toContainText(RYZEN5.nombre);
  await expect(resumen(page).getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
});

test('@humo "Usar en mi armado" abre el armador con el producto elegido', async ({ page }) => {
  await page.goto(`/catalogo/${RYZEN5.id}`);
  await page.getByRole('link', { name: 'Usar en mi armado' }).click();
  await expect(page).toHaveURL(new RegExp(`/armador\\?p=${RYZEN5.id}:1`));
  await expect(resumen(page)).toContainText(RYZEN5.nombre);
  await expect(resumen(page).getByText('Todo es compatible')).toBeVisible();
});

test('@humo "Arma tu PC" de la cabecera lleva al armador', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Arma tu PC' }).first().click();
  await expect(page).toHaveURL(/\/armador$/);
  await expect(page.getByRole('heading', { name: 'Arma tu PC' })).toBeVisible();
});
