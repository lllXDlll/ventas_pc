import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GuardaAutenticacion } from './guardas';
import { LimitesService } from './limites.service';

/** Autenticación, límites y la guarda global de sesión y roles (spec autorizacion-roles). */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, LimitesService, { provide: APP_GUARD, useClass: GuardaAutenticacion }],
  exports: [AuthService],
})
export class AuthModule {}
