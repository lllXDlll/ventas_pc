# esquema-datos Specification

## Purpose

Define el modelo persistente en Postgres, fuente de verdad del stock, las órdenes y las sesiones, y las restricciones de integridad de las que dependen la autenticación, el catálogo y la concurrencia de los sprints siguientes.

## Requirements

### Requirement: Esquema inicial completo
La migración inicial SHALL crear todas las tablas del modelo de datos de la parte técnica: usuarios, sesiones, categorias, productos, stock, reglas_compatibilidad, configuraciones, configuracion_items, carritos, carrito_items, reservas, reserva_items, ordenes, orden_items, comprobantes, notificaciones y uso_asistente. MUST NOT crear la tabla `tokens_recuperacion` (HU-03 diferida).

#### Scenario: Migración en una base vacía
- **WHEN** se aplica la migración inicial sobre una base Postgres vacía
- **THEN** existen todas las tablas listadas y no existe `tokens_recuperacion`

#### Scenario: Migración en local y en Neon
- **WHEN** se aplica la misma migración en el Postgres local de Docker y en Neon
- **THEN** ambas terminan sin error y producen el mismo esquema

### Requirement: Correo de usuario único
La tabla de usuarios MUST rechazar dos usuarios con el mismo correo, sin distinguir mayúsculas de minúsculas.

#### Scenario: Correo duplicado con distinta capitalización
- **WHEN** existe `Ana@correo.com` y se inserta `ana@correo.com`
- **THEN** la base rechaza la inserción por violar la unicidad

### Requirement: Sesión guardada solo como hash
La tabla de sesiones SHALL guardar el hash del token, el usuario, el vencimiento, la marca de revocada y la fecha de creación. MUST NOT existir una columna con el token en claro, y el hash MUST ser único.

#### Scenario: Estructura de sesiones
- **WHEN** se inspecciona la tabla de sesiones
- **THEN** tiene una columna de hash única y no tiene columna para el token en claro

### Requirement: Stock con versión y sin negativos
La tabla de stock SHALL guardar una cantidad física por producto y una versión para bloqueo optimista. La cantidad MUST NOT poder ser negativa.

#### Scenario: Cantidad negativa
- **WHEN** se intenta guardar un stock con cantidad -1
- **THEN** la base rechaza la operación

#### Scenario: Un registro de stock por producto
- **WHEN** se intenta crear un segundo registro de stock para el mismo producto
- **THEN** la base lo rechaza

### Requirement: Clave de idempotencia única en órdenes
La tabla de órdenes SHALL tener una clave de idempotencia con restricción de unicidad.

#### Scenario: Orden repetida con la misma clave
- **WHEN** se inserta una segunda orden con una clave de idempotencia ya usada
- **THEN** la base rechaza la inserción

### Requirement: Valores enumerados restringidos
Los campos de rol (CLIENTE, ADMIN), tipo de producto (COMPONENTE, EQUIPO), origen de configuración (MANUAL, IA) y estado de reserva (ACTIVA, CONFIRMADA, EXPIRADA) MUST aceptar solo esos valores, y los atributos técnicos de productos y los parámetros de reglas SHALL guardarse como JSONB.

#### Scenario: Estado de reserva inválido
- **WHEN** se guarda una reserva con estado `PENDIENTE`
- **THEN** la base rechaza el valor

### Requirement: Migraciones fuera del arranque de la API
Las migraciones MUST aplicarse en un paso explícito (CI o comando manual) usando la cadena de conexión directa, y MUST NOT ejecutarse al iniciar la API.

#### Scenario: Arranque con migración pendiente
- **WHEN** la API arranca y existe una migración sin aplicar
- **THEN** la API no modifica el esquema
