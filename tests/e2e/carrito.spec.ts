// Carrito y reserva en el navegador (specs carrito y reservas; tareas 4.1 a 4.4 del
// Sprint 3). Usa el catálogo de ejemplo; cada prueba cancela su reserva al terminar.
import { expect, type Page, test } from '@playwright/test';
import { API, clienteConSesion, ID_AGOTADO } from './datos';

const id = (n: number) => `0195a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const RYZEN5 = { id: id(1), nombre: 'AMD Ryzen 5 7600' }; // stock 12
const B650 = id(10); // AM5, placa compatible

const contador = (page: Page, n: number) =>
  page.getByRole('link', { name: new RegExp(`Carrito \\(${n} producto`) });
const resumen = (page: Page) => page.getByRole('complementary', { name: 'Resumen del carrito' });

async function alCarritoDesdeDetalle(page: Page) {
  await page.goto(`/catalogo/${RYZEN5.id}`);
  await page.waitForLoadState('networkidle'); // el botón necesita la página hidratada
  await page.getByRole('button', { name: `Añadir al carrito: ${RYZEN5.nombre}` }).click();
  await expect(
    page.getByRole('button', { name: `Añadido al carrito: ${RYZEN5.nombre}` }),
  ).toBeVisible();
}

test('sin sesión, "Añadir al carrito" pide iniciar sesión y vuelve al producto', async ({
  page,
}) => {
  await page.goto(`/catalogo/${RYZEN5.id}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: `Añadir al carrito: ${RYZEN5.nombre}` }).click();
  await expect(page).toHaveURL(/\/ingresar\?volver=%2Fcatalogo%2F/);
});

test('con sesión, agregar desde el detalle aumenta el contador; el carrito edita y calcula el total', async ({
  page,
}) => {
  await clienteConSesion(page);
  await alCarritoDesdeDetalle(page);
  await expect(contador(page, 1)).toBeVisible();

  await contador(page, 1).click();
  await expect(page).toHaveURL(/\/carrito$/);
  const lista = page.getByRole('list', { name: 'Productos del carrito' });
  await expect(lista).toContainText(RYZEN5.nombre);
  const total1 = await resumen(page).locator('.font-display').textContent();

  await lista.getByRole('button', { name: 'Agregar una' }).click();
  await expect(contador(page, 2)).toBeVisible();
  const total2 = await resumen(page).locator('.font-display').textContent();
  const num = (t: string | null) => Number((t ?? '').replace(/[^\d.]/g, ''));
  expect(num(total2)).toBeCloseTo(num(total1) * 2, 2);

  await lista.getByRole('button', { name: `Quitar ${RYZEN5.nombre}` }).click();
  await expect(page.getByText('Tu carrito está vacío')).toBeVisible();
  await expect(contador(page, 0)).toBeVisible();
});

test('iniciar compra reserva con cuenta regresiva, "Pagar" pronto y se puede cancelar', async ({
  page,
}) => {
  await clienteConSesion(page);
  await alCarritoDesdeDetalle(page);
  await page.goto('/carrito');
  await resumen(page).getByRole('button', { name: 'Iniciar compra' }).click();
  const reserva = page.getByRole('region', { name: 'Tu reserva' });
  await expect(reserva.getByLabel('Tiempo restante')).toHaveText(/^(10:00|9:\d\d)$/);
  await expect(reserva.getByRole('button', { name: 'Pagar' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await reserva.getByRole('button', { name: 'Cancelar reserva' }).click();
  await expect(resumen(page).getByRole('button', { name: 'Iniciar compra' })).toBeVisible();
});

test('sin stock suficiente, la reserva indica qué producto faltó', async ({ page }) => {
  await clienteConSesion(page);
  // El producto agotado se agrega por la API (en la pantalla su botón está deshabilitado).
  const res = await page.request.post(`${API}/carrito`, {
    data: { productoId: ID_AGOTADO, cantidad: 1 },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/carrito');
  await expect(page.getByText('Sin stock suficiente')).toBeVisible();
  await resumen(page).getByRole('button', { name: 'Iniciar compra' }).click();
  await expect(resumen(page).getByRole('alert')).toContainText('Intel Core i7-14700K');
});

test('el armador agrega un armado compatible al carrito', async ({ page }) => {
  await clienteConSesion(page);
  await page.goto(`/armador?p=${RYZEN5.id}:1,${B650}:1`);
  const r = page.getByRole('complementary', { name: 'Resumen del armado' });
  await expect(r.getByText('Todo es compatible')).toBeVisible();
  await r.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page).toHaveURL(/\/carrito$/);
  await expect(page.getByRole('list', { name: 'Productos del carrito' })).toContainText(
    'Configuración armada',
  );
  await expect(contador(page, 2)).toBeVisible();
});
