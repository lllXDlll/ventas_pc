import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/guardas';
import {
  CatalogoService,
  type Facetas,
  type Pagina,
  type ProductoAdmin,
  type ProductoPublico,
} from './catalogo.service';
import {
  ActualizarProductoDto,
  ActualizarStockDto,
  CrearProductoDto,
  FacetasDto,
  FiltrosCatalogoDto,
  PaginaAdminDto,
} from './dto';

/** Catálogo público, sin sesión (spec catalogo). */
@Controller()
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get('categorias')
  categorias() {
    return this.catalogo.categorias();
  }

  @Get('productos')
  listar(@Query() filtros: FiltrosCatalogoDto): Promise<Pagina<ProductoPublico>> {
    return this.catalogo.listar(filtros);
  }

  /** Ruta propia para no chocar con productos/:id (design D7). */
  @Get('facetas')
  facetas(@Query() consulta: FacetasDto): Promise<Facetas> {
    return this.catalogo.facetas(consulta.categoria);
  }

  @Get('productos/:id')
  detalle(@Param('id') id: string): Promise<ProductoPublico> {
    return this.catalogo.detalle(id);
  }
}

/** Administración del catálogo: todo /admin exige el rol ADMIN (spec autorizacion-roles). */
@Controller('admin')
@Roles('ADMIN')
export class AdminCatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get('productos')
  listar(@Query() consulta: PaginaAdminDto): Promise<Pagina<ProductoAdmin>> {
    return this.catalogo.listarAdmin(consulta);
  }

  @Post('productos')
  @HttpCode(201)
  crear(@Body() dto: CrearProductoDto): Promise<ProductoAdmin> {
    return this.catalogo.crear(dto);
  }

  @Patch('productos/:id')
  actualizar(@Param('id') id: string, @Body() dto: ActualizarProductoDto): Promise<ProductoAdmin> {
    return this.catalogo.actualizar(id, dto);
  }

  @Patch('stock/:productoId')
  actualizarStock(
    @Param('productoId') productoId: string,
    @Body() dto: ActualizarStockDto,
  ): Promise<{ cantidad: number; version: number }> {
    return this.catalogo.actualizarStock(productoId, dto);
  }
}
