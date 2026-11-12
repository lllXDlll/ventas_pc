# Spec Delta

## MODIFIED Requirements

### Requirement: Acciones de sprints futuros marcadas
Los botones y accesos que dependen de funciones de sprints posteriores (carrito, asistente y ofertas) SHALL estar visibles, pero MUST indicar "Disponible pronto" y MUST NOT ejecutar ninguna acción contra la API. El armado manual deja de estar en esta lista desde el Sprint 2.

#### Scenario: Añadir al carrito
- **WHEN** un visitante pulsa "Añadir al carrito" en el detalle de un producto
- **THEN** ve "Disponible pronto" y no se envía ninguna petición
