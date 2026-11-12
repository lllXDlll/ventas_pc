# Spec Delta

## Purpose
Permite al administrador activar, desactivar y ajustar los parámetros de las reglas de compatibilidad desde el panel, sin tocar el código ni la base a mano, con validación de cada parámetro.

## ADDED Requirements

### Requirement: Listado de reglas
`GET /admin/reglas` SHALL devolver las seis reglas (`SOCKET`, `RAM`, `POTENCIA`, `DIMENSIONES`, `FACTOR_FORMA` y `ALMACENAMIENTO`). Cada una incluye su código, su nombre legible, si está activa, sus parámetros vigentes y la descripción de cada parámetro que admite (nombre, tipo, mínimo, máximo y unidad). La ruta MUST exigir el rol ADMIN.

#### Scenario: Administrador consulta las reglas
- **WHEN** un ADMIN pide `GET /admin/reglas`
- **THEN** recibe seis reglas, y `POTENCIA` muestra `margenPorcentaje` y `consumoBaseW` con sus valores vigentes y sus límites

#### Scenario: Cliente sin permiso
- **WHEN** un CLIENTE pide `GET /admin/reglas`
- **THEN** la API responde 403 con el código `SIN_PERMISO`

### Requirement: Edición de una regla
`PATCH /admin/reglas/:codigo` SHALL aceptar `activa` (booleano) y `parametros` (objeto), ambos opcionales, y devolver la regla actualizada. Los parámetros enviados MUST reemplazar a los vigentes de esa regla. La ruta MUST exigir el rol ADMIN.

#### Scenario: Desactivar una regla
- **WHEN** un ADMIN envía `{ "activa": false }` a `PATCH /admin/reglas/SOCKET`
- **THEN** la respuesta muestra `SOCKET` inactiva y la siguiente consulta de `GET /admin/reglas` también

#### Scenario: Cambiar el margen de potencia
- **WHEN** un ADMIN envía `{ "parametros": { "margenPorcentaje": 30, "consumoBaseW": 50 } }` a `PATCH /admin/reglas/POTENCIA`
- **THEN** la regla queda con margen 30 y consumo base 50

#### Scenario: Regla inexistente
- **WHEN** un ADMIN envía un cambio a `PATCH /admin/reglas/COLOR`
- **THEN** la API responde 404

### Requirement: Parámetros validados por regla
Cada regla SHALL tener un esquema propio de parámetros. Para `POTENCIA`:
- `margenPorcentaje` es un entero de 0 a 100;
- `consumoBaseW` es un entero de 0 a 500;
- ambos son obligatorios al enviar `parametros`.

Las demás reglas MUST aceptar solo un objeto vacío. Un valor fuera de rango, de otro tipo o una clave desconocida MUST responder 400 con el código `PARAMETROS_INVALIDOS`, un mensaje que nombra el parámetro y la regla sin cambios.

#### Scenario: Margen fuera de rango
- **WHEN** un ADMIN envía `margenPorcentaje: 150` a `POTENCIA`
- **THEN** la API responde 400 con `PARAMETROS_INVALIDOS`, el mensaje menciona `margenPorcentaje`, y el margen vigente no cambia

#### Scenario: Parámetro desconocido
- **WHEN** un ADMIN envía `{ "parametros": { "tolerancia": 2 } }` a `SOCKET`
- **THEN** la API responde 400 con `PARAMETROS_INVALIDOS`, y el mensaje dice que `SOCKET` no admite `tolerancia`

#### Scenario: Valor no numérico
- **WHEN** un ADMIN envía `margenPorcentaje: "20"` a `POTENCIA`
- **THEN** la API responde 400 con `PARAMETROS_INVALIDOS`

### Requirement: Cambios aplicados a las siguientes validaciones
Un cambio guardado SHALL aplicarse a la siguiente validación de compatibilidad, sin reiniciar ni redesplegar: armador, configuraciones guardadas, carrito y asistente.

#### Scenario: Margen más exigente
- **WHEN** una configuración pasa `POTENCIA` con margen 20 %, y el ADMIN sube el margen a 60 %
- **THEN** la siguiente llamada a `POST /compatibilidad/validar` con esa configuración devuelve el rechazo `POTENCIA`

#### Scenario: Regla desactivada
- **WHEN** el ADMIN desactiva `SOCKET` y luego se valida un procesador AM5 con una placa LGA1700
- **THEN** la validación no devuelve el rechazo `SOCKET`

### Requirement: Pantalla de reglas
`/admin/reglas` SHALL mostrar una tarjeta por regla, con su nombre, un interruptor de activa e inactiva, y un campo por parámetro con su unidad y sus límites. Al guardar, la pantalla MUST mostrar el resultado o el mensaje de error de la API junto al campo. La pantalla MUST cumplir las reglas de accesibilidad y el ancho de 360 px del sistema de diseño.

#### Scenario: Guardar un parámetro válido
- **WHEN** el ADMIN cambia el margen de potencia a 25 y pulsa "Guardar"
- **THEN** la tarjeta confirma el cambio, y al recargar la página el margen es 25

#### Scenario: Parámetro inválido en pantalla
- **WHEN** el ADMIN escribe 150 en el margen y pulsa "Guardar"
- **THEN** la pantalla muestra el mensaje de la API junto al campo y el valor guardado sigue siendo el anterior
