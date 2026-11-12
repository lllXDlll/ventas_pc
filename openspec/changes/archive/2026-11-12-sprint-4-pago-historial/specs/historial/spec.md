# Spec Delta

## Purpose

Permite al cliente revisar lo que compró y retomar las configuraciones que armó, compradas o no, viendo solo lo propio.

## ADDED Requirements

### Requirement: Lista de compras
`GET /historial/compras` SHALL devolver las órdenes del usuario con sesión, de la más reciente a la más antigua y en páginas de 20 (`?pagina=`), con fecha, total, estado, número de comprobante y cantidad de productos. El estado de una orden es "Pagada", porque una orden solo existe cuando su pago se confirmó. Sin sesión MUST responder 401.

#### Scenario: Orden de la lista
- **WHEN** un cliente con dos compras pide su historial
- **THEN** recibe las dos, la más reciente primero, cada una con su comprobante

#### Scenario: Solo las propias
- **WHEN** otro usuario también tiene compras
- **THEN** el historial del cliente no incluye ninguna de ellas

### Requirement: Detalle de una compra
`GET /historial/compras/:id` SHALL devolver la orden del usuario con sus productos (nombre, cantidad, precio unitario y subtotal), el total y el comprobante. La orden de otro usuario MUST responder 404 sin revelar que existe.

#### Scenario: Detalle propio
- **WHEN** el cliente pide el detalle de una compra suya
- **THEN** recibe sus productos, el total y el número de comprobante

#### Scenario: Orden ajena
- **WHEN** un cliente pide la orden de otro
- **THEN** la API responde 404

### Requirement: Lista de configuraciones
`GET /historial/configuraciones` SHALL devolver todas las configuraciones del usuario, compradas o no, de la más reciente a la más antigua y en páginas de 20, cada una con origen (manual o IA), presupuesto, uso, estado guardado, fecha y componentes (nombre, categoría y cantidad).

#### Scenario: Configuraciones propias
- **WHEN** un cliente con una configuración `VALIDA` y otra `INVALIDA` pide su historial de configuraciones
- **THEN** recibe ambas con su origen, estado y componentes, la más reciente primero

### Requirement: Revalidar una configuración
`POST /historial/configuraciones/:id/revalidar` SHALL recalcular la configuración del usuario con las reglas y el disponible vigentes, guardar el estado resultante y devolver los rechazos, si es agregable y qué productos faltan. La de otro usuario MUST responder 404.

#### Scenario: Producto agotado desde que se guardó
- **WHEN** el cliente revalida una configuración `VALIDA` cuyo procesador ya no tiene disponible
- **THEN** la respuesta indica que no es agregable y nombra el procesador

#### Scenario: Regla nueva
- **WHEN** una regla nueva hace incompatible una configuración guardada como `VALIDA` y el cliente la revalida
- **THEN** la configuración queda `INVALIDA` y la respuesta incluye el rechazo

### Requirement: Pantallas del historial
Un cliente con sesión SHALL tener las pantallas `/cuenta/compras`, con el detalle de cada compra y el enlace a su comprobante, y `/cuenta/configuraciones`, donde cada configuración se puede revalidar y reabrir en el armador. Se llega a ellas desde "Mis compras" y "Mis configuraciones" en la zona de cuenta. Sin sesión MUST llevar a `/ingresar`.

#### Scenario: Reabrir en el armador
- **WHEN** el cliente pulsa "Abrir en el armador" en una configuración
- **THEN** el armador se abre con los componentes de esa configuración

#### Scenario: Historial vacío
- **WHEN** un cliente sin compras abre `/cuenta/compras`
- **THEN** ve un estado vacío con un enlace al catálogo

#### Scenario: Sin sesión
- **WHEN** un visitante sin sesión abre `/cuenta/compras`
- **THEN** es llevado a `/ingresar`
