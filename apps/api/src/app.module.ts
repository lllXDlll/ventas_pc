import { Module } from '@nestjs/common';
import { env } from 'cloudflare:workers';
import { AdminModule } from './admin/admin.module';
import { AsistenteModule } from './asistente/asistente.module';
import { AuthModule } from './auth/auth.module';
import { CarritoModule } from './carrito/carrito.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { CompatibilidadModule } from './compatibilidad/compatibilidad.module';
import { ConfiguracionesModule } from './configuraciones/configuraciones.module';
import { HistorialModule } from './historial/historial.module';
import { HealthModule } from './health/health.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { PagosModule } from './pagos/pagos.module';
import { PruebasModule, pruebasHabilitadas } from './pruebas/pruebas.module';
import { PedidosModule } from './reservas/pedidos.module';
import { ReservasModule } from './reservas/reservas.module';

@Module({
  imports: [
    ReservasModule,
    AuthModule,
    HealthModule,
    CatalogoModule,
    CompatibilidadModule,
    ConfiguracionesModule,
    CarritoModule,
    PedidosModule,
    NotificacionesModule,
    PagosModule,
    HistorialModule,
    AsistenteModule,
    AdminModule,
    // Solo fuera de producción (Sprint 6, D6): la variable nunca va en wrangler.jsonc.
    ...(pruebasHabilitadas(env.PRUEBAS_HABILITADAS) ? [PruebasModule] : []),
  ],
})
export class AppModule {}
