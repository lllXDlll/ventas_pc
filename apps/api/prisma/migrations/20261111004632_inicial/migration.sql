-- Extensión para correos únicos sin distinguir mayúsculas (spec esquema-datos).
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateEnum
CREATE TYPE "rol" AS ENUM ('CLIENTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "estado_usuario" AS ENUM ('ACTIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "tipo_producto" AS ENUM ('COMPONENTE', 'EQUIPO');

-- CreateEnum
CREATE TYPE "codigo_regla" AS ENUM ('SOCKET', 'RAM', 'POTENCIA', 'DIMENSIONES', 'FACTOR_FORMA', 'ALMACENAMIENTO');

-- CreateEnum
CREATE TYPE "origen_configuracion" AS ENUM ('MANUAL', 'IA');

-- CreateEnum
CREATE TYPE "estado_configuracion" AS ENUM ('BORRADOR', 'VALIDA', 'INVALIDA');

-- CreateEnum
CREATE TYPE "estado_reserva" AS ENUM ('ACTIVA', 'CONFIRMADA', 'EXPIRADA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "correo" CITEXT NOT NULL,
    "hash_contrasena" TEXT NOT NULL,
    "rol" "rol" NOT NULL DEFAULT 'CLIENTE',
    "estado" "estado_usuario" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "usuario_id" UUID NOT NULL,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "revocada" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria_id" UUID NOT NULL,
    "tipo" "tipo_producto" NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "atributos" JSONB NOT NULL DEFAULT '{}',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglas_compatibilidad" (
    "id" UUID NOT NULL,
    "codigo" "codigo_regla" NOT NULL,
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "reglas_compatibilidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuraciones" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "origen" "origen_configuracion" NOT NULL,
    "presupuesto" DECIMAL(12,2),
    "uso" TEXT,
    "estado" "estado_configuracion" NOT NULL DEFAULT 'BORRADOR',
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuraciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_items" (
    "id" UUID NOT NULL,
    "configuracion_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "configuracion_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carritos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carritos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrito_items" (
    "id" UUID NOT NULL,
    "carrito_id" UUID NOT NULL,
    "producto_id" UUID,
    "configuracion_id" UUID,
    "cantidad" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "carrito_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "estado" "estado_reserva" NOT NULL DEFAULT 'ACTIVA',
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva_items" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "reserva_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "clave_idempotencia" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_items" (
    "id" UUID NOT NULL,
    "orden_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "orden_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "orden_id" UUID NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detalle" JSONB NOT NULL,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uso_asistente" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "presupuesto" DECIMAL(12,2) NOT NULL,
    "uso" TEXT NOT NULL,
    "resultado" JSONB,
    "latencia_ms" INTEGER NOT NULL,
    "uso_respaldo" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uso_asistente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_token_hash_key" ON "sesiones"("token_hash");

-- CreateIndex
CREATE INDEX "sesiones_usuario_id_idx" ON "sesiones"("usuario_id");

-- CreateIndex
CREATE INDEX "sesiones_vence_en_idx" ON "sesiones"("vence_en");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_codigo_key" ON "categorias"("codigo");

-- CreateIndex
CREATE INDEX "productos_categoria_id_activo_idx" ON "productos"("categoria_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "stock_producto_id_key" ON "stock"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "reglas_compatibilidad_codigo_key" ON "reglas_compatibilidad"("codigo");

-- CreateIndex
CREATE INDEX "configuraciones_usuario_id_idx" ON "configuraciones"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_items_configuracion_id_producto_id_key" ON "configuracion_items"("configuracion_id", "producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "carritos_usuario_id_key" ON "carritos"("usuario_id");

-- CreateIndex
CREATE INDEX "carrito_items_carrito_id_idx" ON "carrito_items"("carrito_id");

-- CreateIndex
CREATE INDEX "reservas_estado_vence_en_idx" ON "reservas"("estado", "vence_en");

-- CreateIndex
CREATE INDEX "reservas_usuario_id_idx" ON "reservas"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "reserva_items_reserva_id_producto_id_key" ON "reserva_items"("reserva_id", "producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_reserva_id_key" ON "ordenes"("reserva_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_clave_idempotencia_key" ON "ordenes"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "ordenes_usuario_id_creada_en_idx" ON "ordenes"("usuario_id", "creada_en");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_numero_key" ON "comprobantes"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_orden_id_key" ON "comprobantes"("orden_id");

-- CreateIndex
CREATE INDEX "notificaciones_usuario_id_leida_idx" ON "notificaciones"("usuario_id", "leida");

-- CreateIndex
CREATE INDEX "uso_asistente_usuario_id_creado_en_idx" ON "uso_asistente"("usuario_id", "creado_en");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuraciones" ADD CONSTRAINT "configuraciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_items" ADD CONSTRAINT "configuracion_items_configuracion_id_fkey" FOREIGN KEY ("configuracion_id") REFERENCES "configuraciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_items" ADD CONSTRAINT "configuracion_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carritos" ADD CONSTRAINT "carritos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrito_items" ADD CONSTRAINT "carrito_items_carrito_id_fkey" FOREIGN KEY ("carrito_id") REFERENCES "carritos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrito_items" ADD CONSTRAINT "carrito_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrito_items" ADD CONSTRAINT "carrito_items_configuracion_id_fkey" FOREIGN KEY ("configuracion_id") REFERENCES "configuraciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_items" ADD CONSTRAINT "reserva_items_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva_items" ADD CONSTRAINT "reserva_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_items" ADD CONSTRAINT "orden_items_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_items" ADD CONSTRAINT "orden_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uso_asistente" ADD CONSTRAINT "uso_asistente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Restricciones que Prisma no expresa (design.md D11) ─────────────

-- Stock físico nunca negativo.
ALTER TABLE "stock" ADD CONSTRAINT "stock_cantidad_no_negativa" CHECK ("cantidad" >= 0);
ALTER TABLE "stock" ADD CONSTRAINT "stock_version_no_negativa" CHECK ("version" >= 0);

-- Importes no negativos.
ALTER TABLE "productos" ADD CONSTRAINT "productos_precio_no_negativo" CHECK ("precio" >= 0);
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_total_no_negativo" CHECK ("total" >= 0);
ALTER TABLE "orden_items" ADD CONSTRAINT "orden_items_precio_no_negativo" CHECK ("precio_unitario" >= 0);
ALTER TABLE "configuraciones" ADD CONSTRAINT "configuraciones_presupuesto_no_negativo" CHECK ("presupuesto" IS NULL OR "presupuesto" >= 0);
ALTER TABLE "uso_asistente" ADD CONSTRAINT "uso_asistente_presupuesto_no_negativo" CHECK ("presupuesto" >= 0);
ALTER TABLE "uso_asistente" ADD CONSTRAINT "uso_asistente_latencia_no_negativa" CHECK ("latencia_ms" >= 0);

-- Cantidades positivas en ítems.
ALTER TABLE "configuracion_items" ADD CONSTRAINT "configuracion_items_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "carrito_items" ADD CONSTRAINT "carrito_items_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "reserva_items" ADD CONSTRAINT "reserva_items_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "orden_items" ADD CONSTRAINT "orden_items_cantidad_positiva" CHECK ("cantidad" > 0);

-- Un ítem de carrito apunta exactamente a un producto o a una configuración.
ALTER TABLE "carrito_items" ADD CONSTRAINT "carrito_items_un_destino"
  CHECK (num_nonnulls("producto_id", "configuracion_id") = 1);
