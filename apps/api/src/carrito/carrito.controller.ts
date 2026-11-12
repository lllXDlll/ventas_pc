import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { SesionActual } from '../auth/auth.service';
import { RequiereSesion, SesionDeLaPeticion } from '../auth/guardas';
import { CarritoService, type VistaCarrito } from './carrito.service';
import { AgregarAlCarritoDto, CambiarCantidadDto } from './dto';

/** Carrito del usuario (spec carrito): todo exige sesión. */
@Controller('carrito')
@RequiereSesion()
export class CarritoController {
  constructor(private readonly carrito: CarritoService) {}

  @Get()
  ver(@SesionDeLaPeticion() s: SesionActual): Promise<VistaCarrito> {
    return this.carrito.ver(s.usuario.id);
  }

  @Post()
  @HttpCode(200)
  agregar(
    @SesionDeLaPeticion() s: SesionActual,
    @Body() dto: AgregarAlCarritoDto,
  ): Promise<VistaCarrito> {
    return this.carrito.agregar(s.usuario.id, dto);
  }

  @Patch('items/:id')
  cambiar(
    @SesionDeLaPeticion() s: SesionActual,
    @Param('id') id: string,
    @Body() dto: CambiarCantidadDto,
  ): Promise<VistaCarrito> {
    return this.carrito.cambiarCantidad(s.usuario.id, id, dto.cantidad);
  }

  @Delete('items/:id')
  quitar(@SesionDeLaPeticion() s: SesionActual, @Param('id') id: string): Promise<VistaCarrito> {
    return this.carrito.quitar(s.usuario.id, id);
  }

  @Delete()
  vaciar(@SesionDeLaPeticion() s: SesionActual): Promise<VistaCarrito> {
    return this.carrito.vaciar(s.usuario.id);
  }
}
