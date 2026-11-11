// Registro, inicio y cierre de sesión en el navegador (spec autenticacion; tareas 5.1 y 5.2).
import { expect, test } from '@playwright/test';
import { alerta, correoNuevo, ingresar, registrar } from './datos';

test('registro exitoso: la pantalla indica que ya se puede iniciar sesión', async ({ page }) => {
  const correo = correoNuevo();
  await registrar(page, correo);
  await expect(page.getByText(`La cuenta ${correo} está lista`)).toBeVisible();
  await expect(page.getByRole('link', { name: 'iniciar sesión' })).toBeVisible();
});

test('registro con un correo repetido muestra el mensaje de la API', async ({ page }) => {
  const correo = correoNuevo();
  await registrar(page, correo);
  await expect(page.getByText('está lista')).toBeVisible();
  await registrar(page, correo.toUpperCase());
  await expect(alerta(page)).toContainText('ya está registrado');
});

test('inicio de sesión fallido muestra el error genérico', async ({ page }) => {
  await ingresar(page, correoNuevo(), 'no-es-la-clave');
  await expect(alerta(page)).toHaveText('Correo o contraseña incorrectos.');
  await expect(page).toHaveURL(/\/ingresar$/);
});

test('inicio de sesión, cabecera con la sesión y cierre de sesión', async ({ page, context }) => {
  const correo = correoNuevo();
  await registrar(page, correo);
  await expect(page.getByText('está lista')).toBeVisible();

  await ingresar(page, correo);
  await expect(page).toHaveURL(/\/catalogo$/);
  const cabecera = page.getByRole('banner');
  await expect(cabecera.getByText(correo)).toBeVisible();
  await expect(cabecera.getByRole('link', { name: 'Panel' })).toHaveCount(0); // CLIENTE

  // La cookie de sesión es HttpOnly y SameSite=Lax (en local, sin Domain ni Secure).
  const cookie = (await context.cookies('http://localhost:8787')).find(
    (c) => c.name === 'xd_sesion',
  );
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: false });

  // La sesión sobrevive a una recarga.
  await page.reload();
  await expect(cabecera.getByText(correo)).toBeVisible();

  await cabecera.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(cabecera.getByRole('link', { name: 'Ingresar' })).toBeVisible();
  await page.reload();
  await expect(cabecera.getByRole('link', { name: 'Ingresar' })).toBeVisible();
});
