// Panel de catálogo en el navegador (specs catalogo y autorizacion-roles; tarea 5.4).
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { ADMIN, alerta, clienteConSesion, ingresar } from './datos';

async function panelComoAdmin(page: Page) {
  await ingresar(page, ADMIN.correo, ADMIN.contrasena);
  await expect(page).toHaveURL(/\/admin\/catalogo$/);
  await expect(page.getByRole('heading', { name: 'Panel de catálogo' })).toBeVisible();
}

async function crearFuente(page: Page): Promise<string> {
  const nombre = `Fuente e2e ${randomUUID().slice(0, 8)}`;
  await page.getByText('Nuevo producto').click();
  await page.getByLabel('Nombre').fill(nombre);
  await page.getByLabel('Categoría').selectOption('FUENTE');
  await page.getByLabel('Precio (S/)').fill('259.90');
  await page.getByLabel('Stock inicial').fill('6');
  await page.getByLabel(/^potenciaEntregadaW/).fill('650');
  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page.getByRole('status')).toContainText(`Se creó «${nombre}»`);
  return nombre;
}

const fila = (page: Page, nombre: string) => page.getByRole('row').filter({ hasText: nombre });

test('un CLIENTE ve el aviso de acceso y ningún dato administrativo', async ({ page }) => {
  await clienteConSesion(page);
  await page.goto('/admin/catalogo');
  await expect(alerta(page)).toHaveText('No tienes acceso al panel de administración.');
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('sin sesión, el panel pide iniciar sesión', async ({ page }) => {
  await page.goto('/admin/catalogo');
  await expect(page.getByText('Inicia sesión como administrador')).toBeVisible();
});

test('un ADMIN crea un producto con los atributos de su categoría', async ({ page }) => {
  await panelComoAdmin(page);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Panel' })).toBeVisible();
  const nombre = await crearFuente(page);
  await expect(fila(page, nombre)).toContainText('versión 0');

  // Los atributos dependen de la categoría elegida.
  await page.getByLabel('Categoría').selectOption('PROCESADOR');
  await expect(page.getByLabel(/^socket/)).toBeVisible();
  await expect(page.getByLabel(/^potenciaEntregadaW/)).toHaveCount(0);
});

test('un ADMIN cambia el precio y el catálogo público lo muestra', async ({ page }) => {
  await panelComoAdmin(page);
  const nombre = await crearFuente(page);
  const f = fila(page, nombre);
  await f.getByRole('textbox').first().fill('271.50');
  await f.getByRole('button', { name: 'Guardar' }).first().click();
  await expect(page.getByRole('status')).toContainText(`Precio guardado: «${nombre}»`);

  await page.goto('/catalogo?precioMin=271.50&precioMax=271.50');
  const tarjeta = page.locator('article.tarjeta').filter({ hasText: nombre });
  await expect(tarjeta).toContainText('S/ 271.50');
});

test('un ADMIN que guarda stock con una versión obsoleta ve el conflicto y la cantidad vigente', async ({
  browser,
}) => {
  // Dos "pestañas" con la misma sesión leen la versión 0.
  const contexto = await browser.newContext();
  const a = await contexto.newPage();
  await panelComoAdmin(a);
  const nombre = await crearFuente(a);
  const b = await contexto.newPage();
  await b.goto('/admin/catalogo');
  await expect(fila(b, nombre)).toContainText('versión 0');
  await a.reload();
  await expect(fila(a, nombre)).toContainText('versión 0');

  // A guarda primero: versión 1.
  await fila(a, nombre).getByRole('spinbutton').fill('9');
  await fila(a, nombre).getByRole('button', { name: 'Guardar' }).nth(1).click();
  await expect(a.getByRole('status')).toContainText('Stock guardado');
  await expect(fila(a, nombre)).toContainText('versión 1');

  // B guarda con la versión 0: conflicto, con la cantidad vigente de A.
  await fila(b, nombre).getByRole('spinbutton').fill('15');
  await fila(b, nombre).getByRole('button', { name: 'Guardar' }).nth(1).click();
  await expect(b.getByRole('status')).toContainText('El stock cambió');
  await expect(b.getByRole('status')).toContainText('Cantidad vigente: 9 (versión 1)');
  await expect(fila(b, nombre).getByRole('spinbutton')).toHaveValue('9');
  await contexto.close();
});
