// Reglas y reportes del panel en el navegador (specs gestion-reglas y reportes; tareas 5.2,
// 5.3 y 5.4 del Sprint 6). Los reportes leen datos sembrados en la base local o en la
// efímera de la CI, en febrero de 2020, fechas en las que ninguna otra prueba crea datos.
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import pg from 'pg';
import { URL_LOCAL } from '../../apps/api/scripts/semillas.ts';
import { ADMIN, ingresar } from './datos';

const bd = new pg.Client({ connectionString: process.env.DIRECT_URL || URL_LOCAL });
const comprador = randomUUID();
const X = '0195a000-0000-7000-8000-000000000001';
const Y = '0195a000-0000-7000-8000-000000000002';

async function restablecerReglas() {
  await bd.query(
    `UPDATE reglas_compatibilidad SET activa = true,
       parametros = CASE WHEN codigo = 'POTENCIA'
         THEN '{"margenPorcentaje": 20, "consumoBaseW": 0}'::jsonb ELSE '{}'::jsonb END`,
  );
}

async function orden(creada: string, total: string, items: [string, number, string][]) {
  const reserva = randomUUID();
  const id = randomUUID();
  await bd.query(
    `INSERT INTO reservas (id, usuario_id, estado, vence_en, creada_en) VALUES ($1, $2, 'CONFIRMADA', $3, $3)`,
    [reserva, comprador, creada],
  );
  await bd.query(
    `INSERT INTO ordenes (id, usuario_id, reserva_id, clave_idempotencia, total, creada_en)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, comprador, reserva, `e2e-reporte-${id}`, total, creada],
  );
  for (const [producto, cantidad, precio] of items) {
    await bd.query(
      `INSERT INTO orden_items (id, orden_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), id, producto, cantidad, precio],
    );
  }
}

async function consulta(creado: string, uso: string, latencia: number, motivo: string | null) {
  await bd.query(
    `INSERT INTO uso_asistente (id, usuario_id, presupuesto, uso, resultado, latencia_ms, uso_respaldo, creado_en)
     VALUES ($1, $2, 5000, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      comprador,
      uso,
      JSON.stringify({
        motivo,
        tokens: motivo ? { entrada: 0, salida: 0 } : { entrada: 3000, salida: 1000 },
      }),
      latencia,
      motivo !== null,
      creado,
    ],
  );
}

test.beforeAll(async () => {
  await bd.connect();
  await bd.query(
    `INSERT INTO usuarios (id, correo, hash_contrasena, actualizado_en) VALUES ($1, $2, 'sin-acceso', now())`,
    [comprador, `e2e-reportes-${comprador}@xdtech.test`],
  );
  await orden('2020-02-03T12:00:00-05:00', '1000.00', [
    [X, 2, '300.00'],
    [Y, 1, '400.00'],
  ]);
  await orden('2020-02-05T12:00:00-05:00', '500.00', [[Y, 1, '500.00']]);
  await consulta('2020-02-03T12:00:00-05:00', 'GAMING', 12_000, null);
  await consulta('2020-02-03T13:00:00-05:00', 'GAMING', 14_000, null);
  await consulta('2020-02-04T12:00:00-05:00', 'OFICINA', 10_000, null);
  await consulta('2020-02-05T12:00:00-05:00', 'ESTUDIO', 4_000, 'IA_TIMEOUT');
});

test.afterAll(async () => {
  await restablecerReglas();
  await bd.query('DELETE FROM ordenes WHERE usuario_id = $1', [comprador]);
  await bd.query('DELETE FROM reservas WHERE usuario_id = $1', [comprador]);
  await bd.query('DELETE FROM usuarios WHERE id = $1', [comprador]);
  await bd.end();
});

async function comoAdmin(page: Page, ruta: string) {
  await ingresar(page, ADMIN.correo, ADMIN.contrasena);
  await expect(page).toHaveURL(/\/admin\/catalogo$/);
  await page.goto(ruta);
  await page.waitForLoadState('networkidle');
}

async function accesible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
}

const tarjeta = (page: Page, nombre: string) => page.getByRole('form', { name: nombre });

test.describe('reglas', () => {
  test.afterEach(restablecerReglas);

  test('desactivar SOCKET y guardar un margen que persiste al recargar', async ({ page }) => {
    await comoAdmin(page, '/admin/reglas');
    await expect(page.getByRole('link', { name: 'Reglas' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const socket = tarjeta(page, 'Socket del procesador y la placa');
    await socket.getByRole('switch', { name: 'Activa' }).uncheck();
    await socket.getByRole('button', { name: 'Guardar' }).click();
    await expect(socket.getByRole('status')).toHaveText('Cambios guardados.');

    const potencia = tarjeta(page, 'Potencia de la fuente');
    await potencia.getByLabel('Margen sobre el consumo (%)').fill('25');
    await potencia.getByRole('button', { name: 'Guardar' }).click();
    await expect(potencia.getByRole('status')).toHaveText('Cambios guardados.');

    await page.reload();
    await expect(
      tarjeta(page, 'Socket del procesador y la placa').getByRole('switch', { name: 'Activa' }),
    ).not.toBeChecked();
    await expect(
      tarjeta(page, 'Potencia de la fuente').getByLabel('Margen sobre el consumo (%)'),
    ).toHaveValue('25');
  });

  test('un margen de 150 muestra el error de la API junto al campo y no se guarda', async ({
    page,
  }) => {
    await comoAdmin(page, '/admin/reglas');
    const potencia = tarjeta(page, 'Potencia de la fuente');
    const margen = potencia.getByLabel('Margen sobre el consumo (%)');
    await margen.fill('150');
    await potencia.getByRole('button', { name: 'Guardar' }).click();
    await expect(margen).toHaveAttribute('aria-invalid', 'true');
    await expect(potencia).toContainText('debe estar entre 0 y 100');
    await page.reload();
    await expect(
      tarjeta(page, 'Potencia de la fuente').getByLabel('Margen sobre el consumo (%)'),
    ).toHaveValue('20');
  });

  test('accesibilidad y 360 px de /admin/reglas', async ({ page }) => {
    await comoAdmin(page, '/admin/reglas');
    await expect(tarjeta(page, 'Potencia de la fuente')).toBeVisible();
    await accesible(page);
  });
});

test.describe('reporte de ventas', () => {
  test('el filtro cambia la URL y los datos; tabla con encabezados', async ({ page }) => {
    await comoAdmin(page, '/admin/reportes/ventas');
    const filtro = page.getByRole('form', { name: 'Rango de fechas' });
    await filtro.getByLabel('Desde').fill('2020-02-01');
    await filtro.getByLabel('Hasta').fill('2020-02-07');
    await filtro.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page).toHaveURL(/desde=2020-02-01&hasta=2020-02-07/);

    const indicadores = page.locator('dl');
    await expect(indicadores.getByText('Órdenes')).toBeVisible();
    await expect(indicadores.locator('div', { hasText: 'Órdenes' }).locator('dd')).toHaveText('2');
    const tabla = page.getByRole('table', { name: 'Productos más vendidos' });
    await expect(tabla.getByRole('columnheader')).toHaveText(['Producto', 'Unidades', 'Importe']);
    await expect(tabla.getByRole('row')).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'Ventas por día' })).toBeVisible();
    await accesible(page);
  });

  test('un rango sin ventas muestra el mensaje en lugar del gráfico', async ({ page }) => {
    await comoAdmin(page, '/admin/reportes/ventas?desde=2020-01-01&hasta=2020-01-07');
    await expect(page.getByText('No hay ventas en este rango')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ventas por día' })).toHaveCount(0);
  });
});

test.describe('reporte del asistente', () => {
  test('indicadores, los cinco usos y los motivos de respaldo', async ({ page }) => {
    await comoAdmin(page, '/admin/reportes/asistente?desde=2020-02-01&hasta=2020-02-07');
    const indicadores = page.locator('dl');
    await expect(
      indicadores.locator('div', { hasText: 'Consultas' }).locator('dd').first(),
    ).toHaveText('4');
    await expect(indicadores).toContainText('25 %');
    await expect(indicadores).toContainText('Costo estimado');
    const usos = page.getByRole('table', { name: 'Consultas por uso previsto' });
    await expect(usos.getByRole('row')).toHaveCount(6); // encabezado y cinco usos
    await expect(usos.getByRole('row', { name: /Gaming/ })).toContainText('2');
    await expect(page.getByRole('table', { name: 'Motivos de respaldo' })).toContainText(
      'Tiempo de espera agotado',
    );
    await expect(page.getByRole('link', { name: 'Reporte del asistente' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await accesible(page);
  });
});
