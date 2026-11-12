# Spec Delta

## ADDED Requirements

### Requirement: Origen IA conservado al editar
Una configuración creada por el asistente SHALL tener origen `IA` con el presupuesto y el uso de la consulta. Al reemplazar sus productos con `PATCH /configuraciones/:id`, MUST conservar el origen, el presupuesto y el uso, y volver a validarse con el motor de reglas, que informa el motivo de cada rechazo.

#### Scenario: Cambio de componente
- **WHEN** el cliente reemplaza la tarjeta gráfica de una configuración recomendada
- **THEN** la configuración sigue con origen `IA`, presupuesto y uso, y su estado refleja la nueva validación

#### Scenario: Cambio incompatible
- **WHEN** el cliente reemplaza la placa por una de otro socket
- **THEN** la respuesta incluye el rechazo de socket con su motivo y la configuración queda `INVALIDA`, sin dejar de ser de origen `IA`
