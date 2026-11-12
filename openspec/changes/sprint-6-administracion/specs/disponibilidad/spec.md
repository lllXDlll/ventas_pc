# Spec Delta

## MODIFIED Requirements

### Requirement: Reconciliación periódica
Cada 5 minutos, la reconciliación SHALL recalcular el disponible de los productos activos y corregir el almacén si difiere, registrando cuántos productos corrigió. El disponible se calcula como stock físico menos las reservas activas.

Las reservas activas MUST ser la unión, por id de reserva, de:
- las que conoce el almacén;
- las que figuran como `ACTIVA` y vigentes en Postgres.

Así no se cuenta dos veces una reserva y el cálculo sigue siendo correcto aunque el almacén haya perdido sus datos. La reconciliación MUST NOT anular el efecto de una reserva hecha durante la reconciliación.

#### Scenario: Disponible desviado
- **WHEN** el disponible de un producto en el almacén difiere de stock físico menos reservas activas, y corre la reconciliación
- **THEN** el almacén queda con el valor correcto y el registro informa un producto corregido

#### Scenario: Reserva concurrente
- **WHEN** se crea una reserva mientras corre la reconciliación
- **THEN** el disponible final descuenta esa reserva

#### Scenario: Almacén sin datos y reservas activas en Postgres
- **WHEN** el almacén perdió sus datos, un producto tiene 5 unidades y 2 reservas `ACTIVA` vigentes en Postgres, y corre la reconciliación
- **THEN** el disponible queda en 3, no en 5

#### Scenario: Reserva conocida por ambos
- **WHEN** una misma reserva de 1 unidad está en el almacén y en Postgres, sobre un producto de 5 unidades
- **THEN** la reconciliación deja el disponible en 4, contando la reserva una sola vez
