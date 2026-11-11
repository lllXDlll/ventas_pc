# tareas-programadas Specification

## Purpose

Ejecuta las tareas periódicas del sistema (expiración de reservas, reconciliación del disponible y limpieza de sesiones) mediante Cron Triggers, sin depender de un proceso siempre encendido ni de estado en memoria.

## Requirements

### Requirement: Horarios de las tareas periódicas
El sistema SHALL registrar exactamente tres horarios: expiración cada minuto, reconciliación cada 5 minutos y limpieza de sesiones una vez al día. Los horarios MUST quedar declarados en la configuración versionada del despliegue.

#### Scenario: Configuración desplegada
- **WHEN** se despliega la API
- **THEN** Cloudflare muestra tres Cron Triggers activos con los horarios de expiración, reconciliación y limpieza

### Requirement: Despacho de cada horario a su tarea
Cada disparo programado SHALL ejecutar únicamente la tarea asociada a su horario. En este cambio las tareas MAY no tener lógica de negocio todavía, pero cada ejecución MUST dejar un registro que identifique la tarea ejecutada.

#### Scenario: Disparo de expiración
- **WHEN** se dispara el horario de cada minuto
- **THEN** se ejecuta solo la tarea de expiración y queda un registro con su nombre

#### Scenario: Disparo de reconciliación
- **WHEN** se dispara el horario de cada 5 minutos
- **THEN** se ejecuta solo la tarea de reconciliación y queda un registro con su nombre

#### Scenario: Disparo de limpieza
- **WHEN** se dispara el horario diario
- **THEN** se ejecuta solo la tarea de limpieza de sesiones y queda un registro con su nombre

### Requirement: Horario desconocido
Un disparo con un horario que no corresponde a ninguna tarea registrada MUST NOT ejecutar ninguna tarea y SHALL dejar un registro de advertencia.

#### Scenario: Cron no reconocido
- **WHEN** el handler programado recibe un horario no registrado
- **THEN** no se ejecuta ninguna tarea y se registra una advertencia con el horario recibido

### Requirement: Ejecución local de tareas programadas
Las tareas programadas SHALL poder dispararse manualmente en el entorno local para probarlas sin esperar al horario real.

#### Scenario: Disparo manual en local
- **WHEN** el desarrollador dispara el handler programado en `wrangler dev` indicando el horario de una tarea
- **THEN** se ejecuta esa tarea igual que en producción
