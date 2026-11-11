import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { HealthModule } from './health/health.module';
import { ReservasModule } from './reservas/reservas.module';

@Module({
  imports: [ReservasModule, AuthModule, HealthModule, CatalogoModule],
})
export class AppModule {}
