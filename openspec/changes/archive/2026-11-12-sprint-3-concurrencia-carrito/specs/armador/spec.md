# Spec Delta

## MODIFIED Requirements

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
