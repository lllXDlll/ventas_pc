// Formato de los campos de tarjeta del pago simulado (spec pagos). Funciones puras: el
// formulario las aplica al escribir y antes de enviar; la API valida de nuevo.

/** Tarjetas de prueba que se muestran en la pantalla de pago. */
export const TARJETAS_PRUEBA = [
  { numero: '4242 4242 4242 4242', resultado: 'Aprobada' },
  { numero: '4000 0000 0000 0002', resultado: 'Rechazada' },
] as const;

/** Agrupa los dígitos de 4 en 4: "4242424242424242" -> "4242 4242 4242 4242" (máx. 19). */
export function formatoNumeroTarjeta(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 19);
  return digitos.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** "1228" o "12/28" -> "12/28"; mientras se escribe, "1" -> "1" y "12" -> "12/". */
export function formatoVencimiento(texto: string, borrando = false): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 4);
  if (digitos.length < 2) return digitos;
  if (digitos.length === 2) return borrando ? digitos : `${digitos}/`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
}

/** Solo dígitos, de 3 o 4. */
export const formatoCvv = (texto: string) => texto.replace(/\D/g, '').slice(0, 4);
