# Spec Delta

## MODIFIED Requirements

### Requirement: Acciones de sprints futuros marcadas
Los botones y accesos que dependen de funciones de sprints posteriores (asistente y ofertas) SHALL estar visibles, pero MUST indicar "Disponible pronto" y MUST NOT ejecutar ninguna acción contra la API. El armado manual dejó de estar en esta lista en el Sprint 2, el carrito en el Sprint 3 y el pago en el Sprint 4.

#### Scenario: Añadir al carrito
- **WHEN** un cliente con sesión pulsa "Añadir al carrito" en el detalle de un producto
- **THEN** el producto se agrega a su carrito, porque desde el Sprint 3 el carrito ya no es una acción futura

#### Scenario: Pagar
- **WHEN** un cliente con una reserva activa pulsa "Pagar"
- **THEN** llega a la pantalla de pago, porque desde el Sprint 4 el pago ya no es una acción futura

#### Scenario: Armador IA
- **WHEN** un visitante pulsa el acceso "Armador IA"
- **THEN** ve "Disponible pronto" y no se envía ninguna petición
