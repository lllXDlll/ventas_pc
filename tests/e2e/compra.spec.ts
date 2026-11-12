// Flujo de compra completo del Sprint 4 (definición de hecho; specs pagos, comprobantes,
// notificaciones e historial; tareas 6.1 y 6.2): armar, reservar, pagar, comprobante,
// campana e historial. Usa el catálogo de ejemplo y la base local o de la CI.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { API, clienteConSesion, ID_AGOTADO } from './datos';

const id = (n: number) => `0195a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const RYZEN5 = { id: id(1), nombre: 'AMD Ryzen 5 7600' };
const B650 = id(10); // AM5, placa compatible

const APROBADA = '4242 4242 4242 4242';
const RECHAZADA = '4000 0000 0000 0002';

const resumenCarrito = (page: Page) =>
  page.getByRole('complementary', { name: 'Resumen del carrito' });
const campana = (page: Page) => page.getByRole('button', { name: /^Notificaciones,/ });

/** Desde /carrito con productos: reserva y va a /pago. */
async function reservarEIrAPagar(page: Page) {
  await page.goto('/carrito');
  await resumenCarrito(page).getByRole('button', { name: 'Iniciar compra' }).click();
  const reserva = page.getByRole('region', { name: 'Tu reserva' });
  await expect(reserva.getByLabel('Tiempo restante')).toBeVisible();
  await reserva.getByRole('link', { name: 'Pagar' }).click();
  await expect(page).toHaveURL(/\/pago$/);
  await expect(page.getByRole('heading', { name: 'Pago', level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle'); // el formulario necesita la página hidratada
}

async function pagarCon(page: Page, numero: string) {
  const form = page.getByRole('form', { name: 'Datos de pago' });
  await form.getByLabel('Número de tarjeta').fill(numero);
  await form.getByLabel('Vencimiento (MM/AA)').fill('12/30');
  await form.getByLabel('CVV').fill('123');
  await form.getByLabel('Titular').fill('Cliente E2E');
  await form.getByRole('button', { name: 'Pagar' }).click();
}

/** Producto al carrito por la API (comparte la cookie de la página). */
async function alCarrito(page: Page, productoId: string, cantidad = 1) {
  const res = await page.request.post(`${API}/carrito`, { data: { productoId, cantidad } });
  expect(res.ok(), await res.text()).toBe(true);
}

async function sinInfracciones(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

const anchoCorrecto = async (page: Page) =>
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);

test('flujo completo: armar, reservar, pagar, comprobante, campana e historial', async ({
  page,
}) => {
  await clienteConSesion(page);

  // Armar una configuración compatible y agregarla al carrito (la guarda).
  await page.goto(`/armador?p=${RYZEN5.id}:1,${B650}:1`);
  const armado = page.getByRole('complementary', { name: 'Resumen del armado' });
  await expect(armado.getByText('Todo es compatible')).toBeVisible();
  await armado.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page).toHaveURL(/\/carrito$/);

  // Reservar y pagar.
  await reservarEIrAPagar(page);
  await expect(page.getByRole('complementary', { name: 'Resumen de la compra' })).toContainText(
    RYZEN5.nombre,
  );
  await pagarCon(page, APROBADA);

  // Comprobante con número correlativo.
  await expect(page).toHaveURL(/\/cuenta\/comprobantes\/[0-9a-f-]{36}\?nueva=1$/);
  const comprobante = page.getByRole('article', { name: /^Comprobante XD-\d{6,}$/ });
  await expect(comprobante).toBeVisible();
  const numero = (await comprobante.getAttribute('aria-label'))!.replace('Comprobante ', '');
  await expect(comprobante).toContainText(RYZEN5.nombre);
  await expect(comprobante).toContainText('terminada en 4242');

  // Campana: 1 aviso con el número de comprobante; se marca como leído.
  await expect(campana(page)).toHaveAccessibleName('Notificaciones, 1 sin leer');
  await campana(page).click();
  const panel = page.getByRole('dialog', { name: 'Notificaciones' });
  await expect(panel).toContainText(numero);
  await panel.getByRole('button', { name: /^Marcar como leída/ }).click();
  await expect(campana(page)).toHaveAccessibleName('Notificaciones, ninguna sin leer');
  await page.keyboard.press('Escape');

  // El carrito quedó vacío tras pagar.
  await expect(page.getByRole('link', { name: 'Carrito (0 productos)' })).toBeVisible();

  // Mis compras: la compra con su comprobante y su detalle.
  await page.getByRole('banner').getByRole('link', { name: 'Mis compras' }).click();
  await expect(page).toHaveURL(/\/cuenta\/compras$/);
  const tabla = page.getByRole('table', { name: 'Mis compras' });
  await expect(tabla).toContainText(numero);
  await expect(tabla).toContainText('Pagada');
  await tabla.getByRole('link', { name: `Ver detalle de la compra ${numero}` }).click();
  await expect(page.getByRole('table', { name: 'Productos de la compra' })).toContainText(
    RYZEN5.nombre,
  );
  await page.getByRole('link', { name: 'Ver comprobante' }).click();
  await expect(page.getByRole('article', { name: `Comprobante ${numero}` })).toBeVisible();

  // Mis configuraciones: revalidar y reabrir en el armador.
  await page.getByRole('banner').getByRole('link', { name: 'Mis configuraciones' }).click();
  await expect(page).toHaveURL(/\/cuenta\/configuraciones$/);
  const tarjeta = page.getByRole('listitem').filter({ hasText: RYZEN5.nombre }).first();
  await expect(tarjeta).toContainText('Manual');
  await expect(tarjeta).toContainText('Compatible');
  await tarjeta.getByRole('button', { name: 'Revalidar' }).click();
  await expect(tarjeta.getByRole('status')).toContainText('Sigue compatible');
  await tarjeta.getByRole('link', { name: 'Abrir en el armador' }).click();
  await expect(page).toHaveURL(/\/armador\?config=[0-9a-f-]{36}/);
  await expect(page.getByRole('complementary', { name: 'Resumen del armado' })).toContainText(
    RYZEN5.nombre,
  );
});

test('pago rechazado: la reserva sigue y el reintento con otra tarjeta confirma', async ({
  page,
}) => {
  await clienteConSesion(page);
  await alCarrito(page, RYZEN5.id);
  await reservarEIrAPagar(page);
  await pagarCon(page, RECHAZADA);
  await expect(page.getByRole('form', { name: 'Datos de pago' }).getByRole('alert')).toContainText(
    'rechazado',
  );
  const resumen = page.getByRole('complementary', { name: 'Resumen de la compra' });
  await expect(resumen.getByLabel('Tiempo restante')).toHaveText(/^\d+:\d\d$/);
  await pagarCon(page, APROBADA);
  await expect(page.getByRole('article', { name: /^Comprobante XD-/ })).toBeVisible();
});

test('producto agotado al reservar: la campana avisa cuál faltó', async ({ page }) => {
  await clienteConSesion(page);
  await alCarrito(page, ID_AGOTADO);
  await page.goto('/carrito');
  await resumenCarrito(page).getByRole('button', { name: 'Iniciar compra' }).click();
  await expect(resumenCarrito(page).getByRole('alert')).toContainText('Intel Core i7-14700K');
  await expect(campana(page)).toHaveAccessibleName('Notificaciones, 1 sin leer');
  await campana(page).click();
  await expect(page.getByRole('dialog', { name: 'Notificaciones' })).toContainText(
    'Intel Core i7-14700K',
  );
});

test('la campana se usa con teclado y Esc devuelve el foco', async ({ page }) => {
  await clienteConSesion(page);
  await page.waitForLoadState('networkidle');
  const boton = campana(page);
  await boton.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Notificaciones' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('No tienes notificaciones.');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(boton).toBeFocused();
});

test('@humo sin sesión no hay campana y el historial lleva a iniciar sesión', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(campana(page)).toHaveCount(0);
  await page.goto('/cuenta/compras');
  await expect(page).toHaveURL(/\/ingresar\?volver=%2Fcuenta%2Fcompras$/);
  await page.goto('/pago');
  await expect(page).toHaveURL(/\/ingresar\?volver=%2Fpago$/);
});

test('historial vacío y pago sin reserva', async ({ page }) => {
  await clienteConSesion(page);
  await page.goto('/cuenta/compras');
  await expect(page.getByText('Todavía no tienes compras')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver catálogo' })).toBeVisible();
  await page.goto('/pago');
  await expect(page.getByText('No tienes una reserva activa')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver al carrito' })).toBeVisible();
});

test('al imprimir el comprobante solo queda el comprobante', async ({ page }) => {
  await clienteConSesion(page);
  await alCarrito(page, RYZEN5.id);
  await reservarEIrAPagar(page);
  await pagarCon(page, APROBADA);
  const comprobante = page.getByRole('article', { name: /^Comprobante XD-/ });
  await expect(comprobante).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('contentinfo')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Imprimir' })).toBeHidden();
  await expect(comprobante).toBeVisible();
});

test.describe('accesibilidad y 360 px de las pantallas nuevas', () => {
  test('pago, comprobante, historial, configuraciones y campana', async ({ page }) => {
    await clienteConSesion(page);
    await page.goto(`/armador?p=${RYZEN5.id}:1,${B650}:1`);
    const armado = page.getByRole('complementary', { name: 'Resumen del armado' });
    await expect(armado.getByText('Todo es compatible')).toBeVisible();
    await armado.getByRole('button', { name: 'Agregar al carrito' }).click();
    await expect(page).toHaveURL(/\/carrito$/);
    await reservarEIrAPagar(page);
    await sinInfracciones(page);
    await page.setViewportSize({ width: 360, height: 780 });
    await anchoCorrecto(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await pagarCon(page, APROBADA);
    await expect(page.getByRole('article', { name: /^Comprobante XD-/ })).toBeVisible();
    const comprobante = page.url();
    for (const ruta of [comprobante, '/cuenta/compras', '/cuenta/configuraciones']) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main h1')).toBeVisible();
      await sinInfracciones(page);
      await page.setViewportSize({ width: 360, height: 780 });
      await anchoCorrecto(page);
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    await campana(page).click();
    await expect(page.getByRole('dialog', { name: 'Notificaciones' })).toBeVisible();
    await sinInfracciones(page);
  });
});
