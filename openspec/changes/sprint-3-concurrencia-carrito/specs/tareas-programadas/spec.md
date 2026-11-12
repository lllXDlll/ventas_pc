# Spec Delta

## MODIFIED Requirements

### Requirement: Despacho de cada horario a su tarea
Cada disparo programado SHALL ejecutar únicamente la tarea asociada a su horario, y las tres tareas MUST tener su lógica real: la expiración de reservas vencidas, la reconciliación del disponible y la limpieza de sesiones. Cada ejecución MUST dejar un registro que identifique la tarea ejecutada y su resultado.

#### Scenario: Disparo de expiración
- **WHEN** se dispara el horario de cada minuto
- **THEN** se ejecuta solo la tarea de expiración y queda un registro con su nombre y la cantidad de reservas expiradas

#### Scenario: Disparo de reconciliación
- **WHEN** se dispara el horario de cada 5 minutos
- **THEN** se ejecuta solo la tarea de reconciliación y queda un registro con su nombre y la cantidad de productos corregidos

#### Scenario: Disparo de limpieza
- **WHEN** se dispara el horario diario
- **THEN** se ejecuta solo la tarea de limpieza de sesiones y queda un registro con su nombre
