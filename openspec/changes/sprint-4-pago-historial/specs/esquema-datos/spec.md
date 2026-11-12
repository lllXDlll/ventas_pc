# Spec Delta

## ADDED Requirements

### Requirement: Secuencia de números de comprobante
Una migración SHALL crear la secuencia de Postgres de la que salen los números de comprobante y renumerar los comprobantes existentes como `XD-000001`, `XD-000002`… según su fecha, dejando la secuencia en el último número usado. La unicidad del número en la tabla de comprobantes MUST mantenerse.

#### Scenario: Migración con comprobantes previos
- **WHEN** se aplica la migración sobre una base con 3 comprobantes en el formato `XD-AAAAMMDD-<id>`
- **THEN** quedan `XD-000001`, `XD-000002` y `XD-000003` en orden de fecha, y la siguiente compra recibe `XD-000004`

#### Scenario: Migración en una base vacía
- **WHEN** se aplica la migración sin comprobantes
- **THEN** la primera compra recibe `XD-000001`
