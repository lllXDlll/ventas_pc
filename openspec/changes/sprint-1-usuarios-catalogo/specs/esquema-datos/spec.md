# Spec Delta

## MODIFIED Requirements

### Requirement: Sesión guardada solo como hash
La tabla de sesiones SHALL guardar el hash del token, el usuario, el vencimiento, la marca de revocada, la fecha de revocación (vacía mientras la sesión no esté revocada) y la fecha de creación. MUST NOT existir una columna con el token en claro, y el hash MUST ser único.

#### Scenario: Estructura de sesiones
- **WHEN** se inspecciona la tabla de sesiones
- **THEN** tiene una columna de hash única y no tiene columna para el token en claro

#### Scenario: Fecha de revocación
- **WHEN** se revoca una sesión
- **THEN** queda marcada como revocada y con la fecha y hora de la revocación
