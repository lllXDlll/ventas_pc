# Spec Delta

## Purpose

Da al cliente una constancia de cada compra: un comprobante con número correlativo, fecha, detalle y total, que puede consultar e imprimir.

## ADDED Requirements

### Requirement: Comprobante generado con la orden
Al confirmarse una orden SHALL crearse, en la misma transacción, un comprobante con número, fecha, detalle y total. El detalle MUST guardar por producto el nombre, la cantidad, el precio unitario y el subtotal tal como eran al comprar, junto con los 4 últimos dígitos de la tarjeta.

#### Scenario: Compra de dos productos
- **WHEN** se confirma una orden con 2 unidades de un producto de 100.00 y 1 de otro de 50.00
- **THEN** existe su comprobante con los dos productos, sus subtotales 200.00 y 50.00 y el total 250.00

#### Scenario: Producto editado después
- **WHEN** el administrador cambia el nombre o el precio de un producto ya comprado
- **THEN** el comprobante sigue mostrando el nombre y el precio del momento de la compra

### Requirement: Número correlativo
El número de comprobante SHALL tener el formato `XD-` seguido de 6 o más dígitos (`XD-000001`, `XD-000002`…), creciente en el orden de confirmación y sin repetirse, también cuando varias compras se confirman a la vez.

#### Scenario: Compras seguidas
- **WHEN** se confirman dos compras una después de la otra
- **THEN** la segunda tiene el número siguiente al de la primera

#### Scenario: Compras simultáneas
- **WHEN** 10 clientes confirman su compra a la vez
- **THEN** los 10 comprobantes tienen números distintos con el formato `XD-NNNNNN`

### Requirement: Consulta del comprobante
`GET /comprobantes/:id` SHALL devolver el comprobante al dueño de la orden: número, fecha, correo del cliente, detalle y total. Sin sesión MUST responder 401, y el comprobante de otro usuario, 404 sin revelar que existe.

#### Scenario: Dueño
- **WHEN** el cliente pide el comprobante de su compra
- **THEN** recibe su número, fecha, detalle y total

#### Scenario: Comprobante ajeno
- **WHEN** un cliente pide el comprobante de otro usuario
- **THEN** la API responde 404

### Requirement: Vista imprimible
La ruta `/cuenta/comprobantes/[id]` SHALL mostrar el comprobante con el nombre de la tienda, el número, la fecha, la tabla de productos y el total, y un botón "Imprimir". Al imprimir MUST ocultarse la cabecera, el pie y los botones de la tienda.

#### Scenario: Impresión
- **WHEN** el cliente pulsa "Imprimir" en su comprobante
- **THEN** se abre el diálogo de impresión y la página impresa solo contiene el comprobante
