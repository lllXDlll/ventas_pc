# armador Specification

## Purpose
Ofrece al cliente una pantalla para armar su PC eligiendo componentes por categoría, con la compatibilidad validada en vivo y la posibilidad de guardar el armado para retomarlo después.

## Requirements

### Requirement: Selección por categoría con stock
La pantalla `/armador` SHALL mostrar los pasos procesador, placa madre, memoria RAM, tarjeta gráfica, almacenamiento, fuente y gabinete. Cada paso MUST ofrecer solo productos activos con disponible mayor que cero, usando las tarjetas de producto del catálogo.

#### Scenario: Elegir un procesador
- **WHEN** un visitante abre el paso de procesador
- **THEN** ve solo procesadores con stock y puede elegir uno

### Requirement: Compatibilidad en vivo
Cada vez que cambia la selección, la pantalla SHALL validar la configuración con el motor y mostrar si es compatible y, si no, cada rechazo con su mensaje, junto a los componentes involucrados. También MUST mostrar el total de la configuración.

#### Scenario: Rechazo visible
- **WHEN** el visitante elige un procesador LGA1700 y una placa AM5
- **THEN** la pantalla muestra el rechazo de socket con su mensaje, sin recargar la página

#### Scenario: Corrección
- **WHEN** después cambia la placa por una LGA1700
- **THEN** el rechazo desaparece

### Requirement: Guardar y retomar el armado
La pantalla SHALL permitir guardar la configuración. Sin sesión, MUST pedir iniciar sesión sin perder la selección. Una configuración guardada MUST poder reabrirse desde la URL del armador, e indicar si es agregable al carrito. El botón "Agregar al carrito" se muestra deshabilitado, con el motivo, si la configuración no es agregable. Si lo es, guarda la configuración y la agrega al carrito.

#### Scenario: Guardar con sesión
- **WHEN** un CLIENTE guarda su armado
- **THEN** la URL pasa a incluir el identificador de la configuración y al recargar se ve el mismo armado

#### Scenario: Guardar sin sesión
- **WHEN** un visitante pulsa "Guardar" sin sesión
- **THEN** se le pide iniciar sesión y, al volver, conserva los componentes elegidos

#### Scenario: Agregar al carrito desde el armador
- **WHEN** un CLIENTE con un armado compatible y con stock pulsa "Agregar al carrito"
- **THEN** la configuración queda guardada y su ítem aparece en `/carrito`

### Requirement: Acceso desde el catálogo
El acceso "Arma tu PC" del shell SHALL llevar al armador, y el botón "Usar en mi armado" del detalle de un producto SHALL abrir el armador con ese producto ya elegido.

#### Scenario: Desde el detalle
- **WHEN** un visitante pulsa "Usar en mi armado" en un procesador
- **THEN** llega a `/armador` con ese procesador elegido y la validación en vivo actualizada

### Requirement: Configuración recomendada por el asistente
Al abrir en el armador una configuración de origen `IA`, la pantalla SHALL indicar que fue recomendada por el asistente, con su presupuesto y su uso. Cada cambio de componente MUST revalidarse en vivo y mostrar el motivo de los rechazos, igual que en un armado manual.

#### Scenario: Insignia de origen
- **WHEN** el cliente abre `/armador?config=<id>` de una configuración recomendada
- **THEN** ve la insignia "Recomendada por IA" con el presupuesto y el uso

#### Scenario: Guardar los cambios
- **WHEN** cambia la tarjeta gráfica y pulsa "Guardar cambios"
- **THEN** la configuración guardada conserva su origen `IA`
