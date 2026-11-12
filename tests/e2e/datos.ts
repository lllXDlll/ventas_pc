// Datos de las pruebas e2e. El administrador solo existe en la base local o en la efímera
// de la CI (no son credenciales de producción).
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

export const ADMIN = {
  correo: process.env.E2E_ADMIN_CORREO ?? 'admin-e2e@xdtech.test',
  contrasena: process.env.E2E_ADMIN_CONTRASENA ?? 'clave-admin-e2e-local',
};

/** Producto agotado del catálogo de ejemplo (Intel Core i7-14700K, stock 0). */
/** URL de la API (las pruebas que llaman a la API directamente comparten la cookie). */
export const API = process.env.E2E_API_URL ?? 'http://localhost:8787';

export const ID_AGOTADO = '0195a000-0000-7000-8000-000000000004';

export const CONTRASENA = 'clave-segura-e2e';

/** Alerta de la página (Next agrega fuera de <main> un anunciador de rutas vacío con role=alert). */
export const alerta = (page: Page) => page.locator('main').getByRole('alert');

export const correoNuevo = () => `e2e-${randomUUID()}@xdtech.test`;

export async function registrar(page: Page, correo: string, contrasena = CONTRASENA) {
  await page.goto('/registro');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel(/^Contraseña/).fill(contrasena);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
}

export async function ingresar(page: Page, correo: string, contrasena = CONTRASENA) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña').fill(contrasena);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Cuenta CLIENTE nueva con la sesión iniciada en `page`. */
export async function clienteConSesion(page: Page): Promise<string> {
  const correo = correoNuevo();
  await registrar(page, correo);
  await expect(page.getByText(`La cuenta ${correo} está lista`)).toBeVisible();
  await ingresar(page, correo);
  await expect(page.getByRole('banner').getByText(correo)).toBeVisible();
  return correo;
}
