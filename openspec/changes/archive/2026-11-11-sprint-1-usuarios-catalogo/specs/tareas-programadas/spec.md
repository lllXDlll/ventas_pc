# Spec Delta

## MODIFIED Requirements

### Requirement: Despacho de cada horario a su tarea
Cada disparo programado SHALL ejecutar únicamente la tarea asociada a su horario. La limpieza de sesiones MUST tener su lógica real. La expiración y la reconciliación MAY seguir sin lógica de negocio hasta el Sprint 3. Cada ejecución MUST dejar un registro que identifique la tarea ejecutada.

#### Scenario: Disparo de expiración
- **WHEN** se dispara el horario de cada minuto
- **THEN** se ejecuta solo la tarea de expiración y queda un registro con su nombre

#### Scenario: Disparo de reconciliación
- **WHEN** se dispara el horario de cada 5 minutos
- **THEN** se ejecuta solo la tarea de reconciliación y queda un registro con su nombre

#### Scenario: Disparo de limpieza
- **WHEN** se dispara el horario diario
- **THEN** se ejecuta solo la tarea de limpieza de sesiones y queda un registro con su nombre

## ADDED Requirements

### Requirement: Limpieza diaria de sesiones
La tarea diaria SHALL borrar las sesiones vencidas y las revocadas hace más de un día, y registrar cuántas borró. MUST NOT borrar sesiones válidas ni las revocadas hace menos de un día.

#### Scenario: Sesiones mezcladas
- **WHEN** la tabla tiene una sesión vencida, una revocada hace dos días, una revocada hace una hora y una válida, y se dispara la limpieza
- **THEN** se borran la vencida y la revocada hace dos días, se conservan las otras dos y el registro informa 2 sesiones borradas

#### Scenario: Fallo de la base
- **WHEN** Postgres no responde durante la limpieza
- **THEN** la tarea registra el error y termina sin afectar a los demás horarios
