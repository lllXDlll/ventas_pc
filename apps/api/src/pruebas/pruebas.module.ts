import { Controller, HttpCode, Module, Post } from '@nestjs/common';
import { Roles } from '../auth/guardas';
import { DisponibleService } from '../reservas/disponible.service';

/**
 * Rutas solo para las pruebas de carga (spec pruebas-carga, design D6 del Sprint 6).
 * AppModule registra este módulo únicamente si PRUEBAS_HABILITADAS vale "true"; en
 * producción la variable no existe y la ruta responde 404 como cualquier otra desconocida.
 */
@Controller('pruebas')
@Roles('ADMIN')
export class PruebasController {
  constructor(private readonly disponible: DisponibleService) {}

  /** Escenario de pérdida del almacén: vacía el Durable Object Inventario. */
  @Post('inventario/vaciar')
  @HttpCode(200)
  vaciar(): Promise<{ productos: number; reservas: number }> {
    return this.disponible.vaciar();
  }
}

@Module({ controllers: [PruebasController] })
export class PruebasModule {}

/** El módulo de pruebas se registra solo con PRUEBAS_HABILITADAS="true". */
export const pruebasHabilitadas = (valor: string | undefined) => valor === 'true';
