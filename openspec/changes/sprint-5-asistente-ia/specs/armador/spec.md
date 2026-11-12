# Spec Delta

## ADDED Requirements

### Requirement: Configuración recomendada por el asistente
Al abrir en el armador una configuración de origen `IA`, la pantalla SHALL indicar que fue recomendada por el asistente, con su presupuesto y su uso. Cada cambio de componente MUST revalidarse en vivo y mostrar el motivo de los rechazos, igual que en un armado manual.

#### Scenario: Insignia de origen
- **WHEN** el cliente abre `/armador?config=<id>` de una configuración recomendada
- **THEN** ve la insignia "Recomendada por IA" con el presupuesto y el uso

#### Scenario: Guardar los cambios
- **WHEN** cambia la tarjeta gráfica y pulsa "Guardar cambios"
- **THEN** la configuración guardada conserva su origen `IA`
