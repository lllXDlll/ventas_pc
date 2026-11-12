# Spec Delta

## MODIFIED Requirements

### Requirement: Disponibilidad a través del puerto del almacén
La disponibilidad que muestra el catálogo SHALL obtenerse del servicio de disponibilidad, que desde el Sprint 3 la lee del almacén de disponibilidad: stock físico menos reservas activas. Las respuestas del catálogo MUST conservar su forma; solo cambia el valor de `disponible`.

#### Scenario: Disponibilidad igual al stock físico
- **WHEN** un producto tiene stock físico 7 y ninguna reserva activa
- **THEN** el catálogo informa una disponibilidad de 7

#### Scenario: Disponibilidad con reservas
- **WHEN** un producto tiene stock físico 7 y una reserva activa de 2
- **THEN** el catálogo informa una disponibilidad de 5

#### Scenario: Todo reservado
- **WHEN** las reservas activas de un producto igualan su stock físico
- **THEN** el producto no aparece en el listado público y su detalle lo marca como agotado
