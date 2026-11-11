import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 429 con `{ codigo: DEMASIADAS_PETICIONES, mensaje }` y la cabecera Retry-After
 * (spec limite-peticiones). El filtro global de errores agrega la cabecera.
 */
export class DemasiadasPeticiones extends HttpException {
  constructor(
    readonly reintentarEnS: number,
    mensaje = 'Demasiados intentos. Espera un momento y vuelve a intentarlo.',
  ) {
    super({ codigo: 'DEMASIADAS_PETICIONES', mensaje }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
