# Spec Delta

## Purpose
Mantiene el disponible para vender de cada producto (stock físico menos reservas activas) en el almacén de disponibilidad. Lo reconstruye desde Postgres cuando falta y lo corrige periódicamente, para que el catálogo y las reservas usen siempre un valor correcto.

## ADDED Requirements

### Requirement: Lectura del disponible desde el almacén
El disponible de los productos SHALL leerse del almacén de disponibilidad, con una sola llamada para todos los productos de una consulta del catálogo. MUST NOT asumirse cero cuando un producto no está inicializado en el almacén.

#### Scenario: Disponible con una reserva activa
- **WHEN** un producto tiene stock físico 7 y una reserva activa de 2
- **THEN** el catálogo informa un disponible de 5

### Requirement: Reconstrucción perezosa por producto
Si el disponible de un producto no existe en el almacén, SHALL reconstruirse desde Postgres (stock físico menos reservas `ACTIVA` de ese producto) antes de leerlo o reservarlo. La reconstrucción MUST NOT sobrescribir un valor existente, y MUST NOT depender del arranque de la API.

#### Scenario: Almacén vacío
- **WHEN** se vacía el almacenamiento del objeto y un cliente consulta el catálogo o reserva
- **THEN** el disponible de los productos involucrados se reconstruye y es correcto, sin intervención manual

### Requirement: Reconciliación periódica
Cada 5 minutos, la reconciliación SHALL recalcular el disponible de los productos activos como stock físico menos reservas activas y corregir el almacén si difiere, registrando cuántos productos corrigió. MUST NOT anular el efecto de una reserva hecha durante la reconciliación.

#### Scenario: Disponible desviado
- **WHEN** el disponible de un producto en el almacén difiere de stock físico menos reservas activas, y corre la reconciliación
- **THEN** el almacén queda con el valor correcto y el registro informa un producto corregido

#### Scenario: Reserva concurrente
- **WHEN** se crea una reserva mientras corre la reconciliación
- **THEN** el disponible final descuenta esa reserva

### Requirement: Cambios de stock reflejados en el almacén
Cuando un ADMIN cambia el stock físico de un producto, el disponible en el almacén SHALL ajustarse en la misma diferencia, sin esperar a la reconciliación.

#### Scenario: Reposición
- **WHEN** un ADMIN sube el stock de un producto de 5 a 8
- **THEN** su disponible sube en 3 en la siguiente consulta del catálogo
