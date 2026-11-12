# Spec Delta

## Purpose
Reúne lo que el cliente quiere comprar, productos sueltos o configuraciones validadas, con cantidades y un total actualizado, como paso previo a reservar el stock y pagar.

## ADDED Requirements

### Requirement: Carrito por usuario
Cada usuario con sesión SHALL tener un único carrito, que se crea al agregar el primer ítem. `GET /carrito` MUST devolver los ítems con su producto o configuración, la cantidad, el subtotal y el total con los precios vigentes. Sin sesión, los endpoints del carrito MUST responder 401.

#### Scenario: Carrito vacío
- **WHEN** un cliente sin ítems pide `GET /carrito`
- **THEN** recibe un carrito vacío con total 0.00

#### Scenario: Sin sesión
- **WHEN** un visitante sin sesión llama a `GET /carrito` o `POST /carrito`
- **THEN** la API responde 401

### Requirement: Agregar productos sueltos
`POST /carrito` SHALL agregar un producto activo con una cantidad de 1 a 8. Si el producto ya está en el carrito, MUST sumar la cantidad sin crear otro ítem, sin pasar de 8. Un producto inexistente o inactivo MUST responder 400. Se admite un producto agotado, pero el carrito lo marca sin disponible.

#### Scenario: Mismo producto dos veces
- **WHEN** un cliente agrega dos veces una memoria RAM con cantidad 1
- **THEN** el carrito tiene un solo ítem con cantidad 2

### Requirement: Agregar configuraciones validadas
`POST /carrito` SHALL agregar una configuración propia revalidándola con el motor de compatibilidad. Si es incompatible, MUST responder 409 con los rechazos y no agregarla. Una configuración ajena o inexistente MUST responder 404.

#### Scenario: Configuración incompatible
- **WHEN** un cliente agrega una configuración con un procesador LGA1700 y una placa AM5
- **THEN** la API responde 409 con el rechazo `SOCKET` y el carrito no cambia

#### Scenario: Configuración compatible
- **WHEN** un cliente agrega su configuración compatible
- **THEN** el carrito tiene un ítem con esa configuración, sus productos y su subtotal

### Requirement: Cambiar cantidades y quitar ítems
`PATCH /carrito/items/:id` SHALL cambiar la cantidad de un ítem (de 1 a 8), y `DELETE /carrito/items/:id` SHALL quitarlo. `DELETE /carrito` SHALL vaciar el carrito. Un ítem de otro usuario MUST responder 404.

#### Scenario: Cambiar cantidad
- **WHEN** un cliente cambia a 3 la cantidad de un ítem cuyo precio es 100.00
- **THEN** el subtotal es 300.00 y el total se recalcula

#### Scenario: Quitar
- **WHEN** un cliente quita un ítem
- **THEN** el ítem ya no aparece y el total se recalcula

### Requirement: Pantalla del carrito
El frontend SHALL ofrecer la pantalla `/carrito` con los ítems, sus cantidades editables, el total y el botón "Iniciar compra". Los botones "Añadir al carrito" del catálogo, del detalle y del armador MUST agregar al carrito, y pedir iniciar sesión cuando no la hay. La cabecera MUST mostrar la cantidad de productos en el carrito.

#### Scenario: Añadir desde el detalle
- **WHEN** un cliente con sesión pulsa "Añadir al carrito" en el detalle de un producto
- **THEN** el contador de la cabecera aumenta y el producto aparece en `/carrito`

#### Scenario: Añadir sin sesión
- **WHEN** un visitante pulsa "Añadir al carrito"
- **THEN** se le pide iniciar sesión y, al volver, puede agregarlo
