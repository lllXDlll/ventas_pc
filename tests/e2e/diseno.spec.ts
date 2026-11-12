// Sistema de diseño, accesibilidad y vitrina interna (specs sistema-diseno y
// arquitectura-frontend; tareas 4.6, 6.2, 6.4, 10.1 y 10.2 del Sprint 1.5).
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { ADMIN, clienteConSesion, ID_AGOTADO, ingresar } from './datos';

/** Las pantallas del sitio (el panel necesita la sesión de un ADMIN); el armador desde el Sprint 2. */
const PANTALLAS = [
  { nombre: 'inicio', ruta: '/' },
  { nombre: 'listado', ruta: '/catalogo' },
  { nombre: 'detalle', ruta: `/catalogo/${ID_AGOTADO}` },
  { nombre: 'inicio de sesión', ruta: '/ingresar' },
  { nombre: 'registro', ruta: '/registro' },
  { nombre: 'recuperar', ruta: '/recuperar' },
  { nombre: 'armador', ruta: '/armador' },
];

async function abrirPanel(page: Page) {
  await ingresar(page, ADMIN.correo, ADMIN.contrasena);
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toContainText('S/');
}

/** Cliente con sesión y un producto en el carrito, en /carrito. */
async function carritoConProducto(page: Page) {
  await clienteConSesion(page);
  await page.goto('/catalogo/0195a000-0000-7000-8000-000000000001');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Añadir al carrito/ }).click();
  await expect(page.getByRole('link', { name: 'Carrito (1 producto)' })).toBeVisible();
  await page.goto('/carrito');
  await expect(page.getByRole('list', { name: 'Productos del carrito' })).toBeVisible();
}

async function sinInfracciones(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

test('@humo la vitrina /dev/ui muestra los componentes base y no se indexa', async ({ page }) => {
  await page.goto('/dev/ui');
  await expect(page.getByRole('heading', { name: 'Vitrina de componentes' })).toBeVisible();
  for (const nombre of ['Primario', 'Secundario', 'Fantasma', 'Arma tu PC con IA']) {
    await expect(page.getByRole('button', { name: nombre })).toBeVisible();
  }
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test.describe('accesibilidad (axe: sin infracciones graves, contraste incluido)', () => {
  for (const { nombre, ruta } of PANTALLAS) {
    test(`@humo ${nombre}`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
      await sinInfracciones(page);
    });
  }
  test('panel', async ({ page }) => {
    await abrirPanel(page);
    await sinInfracciones(page);
  });
  test('carrito', async ({ page }) => {
    await carritoConProducto(page);
    await sinInfracciones(page);
  });
});

test.describe('360 px sin desplazamiento horizontal', () => {
  test.use({ viewport: { width: 360, height: 780 } });
  const anchoCorrecto = async (page: Page) =>
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
  for (const { nombre, ruta } of PANTALLAS) {
    test(`@humo ${nombre}`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
      await anchoCorrecto(page);
    });
  }
  test('panel', async ({ page }) => {
    await abrirPanel(page);
    await anchoCorrecto(page);
  });
  test('carrito', async ({ page }) => {
    // El correo de la cabecera solo se ve en escritorio: se inicia sesión ahí y luego 360 px.
    await page.setViewportSize({ width: 1280, height: 800 });
    await carritoConProducto(page);
    await page.setViewportSize({ width: 360, height: 780 });
    await anchoCorrecto(page);
  });
});

test('@humo el mega menú se usa con teclado y Esc devuelve el foco', async ({ page }) => {
  await page.goto('/');
  const boton = page.getByRole('button', { name: 'Todas las categorías' });
  await boton.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('dialog', { name: 'Categorías y marcas' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link', { name: 'Procesador' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link', { name: 'Placa madre' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(boton).toBeFocused();
});

test.describe('menú lateral móvil', () => {
  test.use({ viewport: { width: 360, height: 780 } });
  test('@humo se abre con teclado, atrapa el foco y Esc lo cierra', async ({ page }) => {
    await page.goto('/');
    const boton = page.getByRole('button', { name: 'Abrir menú' });
    await boton.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('dialog', { name: 'Menú' });
    await expect(menu).toBeVisible();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await menu.evaluate((m) => m.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(boton).toBeFocused();
  });
});

test('@humo los accesos de sprints futuros no hacen peticiones', async ({ page }) => {
  // Desde el Sprint 3 el carrito funciona: quedan el asistente (Armador IA) y las ofertas.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const peticiones: string[] = [];
  page.on('request', (r) => peticiones.push(r.url()));
  // aria-disabled: Playwright no hace clic en elementos deshabilitados, se despacha el evento.
  await page.getByRole('button', { name: 'Armador IA' }).dispatchEvent('click');
  await expect(page.getByText('Disponible pronto').first()).toBeVisible();
  await page.getByRole('button', { name: 'Ofertas' }).dispatchEvent('click');
  await page.waitForTimeout(300);
  expect(peticiones).toEqual([]);
});
