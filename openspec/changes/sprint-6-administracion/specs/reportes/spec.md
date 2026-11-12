# Spec Delta

## Purpose
Da al administrador reportes de ventas y de uso del asistente de IA por rango de fechas, para conocer el desempeño de la tienda y evaluar la utilidad y el costo del asistente.

## ADDED Requirements

### Requirement: Rango de fechas de los reportes
Los reportes SHALL aceptar `desde` y `hasta` en formato `AAAA-MM-DD`. Ambas fechas son inclusivas y se interpretan en hora de Lima (UTC−5). Sin parámetros, el rango MUST ser los últimos 30 días, incluido hoy. Un rango con `desde` posterior a `hasta`, de más de 366 días o con una fecha mal formada MUST responder 400 con el código `SOLICITUD_INVALIDA`. La respuesta MUST incluir el rango aplicado. Las rutas MUST exigir el rol ADMIN.

#### Scenario: Sin parámetros
- **WHEN** un ADMIN pide `GET /admin/reportes/ventas` el 2026-11-30
- **THEN** el rango aplicado es del 2026-11-01 al 2026-11-30

#### Scenario: Orden al borde del día
- **WHEN** existe una orden creada el 2026-11-10 a las 23:30 hora de Lima (04:30 UTC del día 11) y se pide el rango del 2026-11-10 al 2026-11-10
- **THEN** la orden se cuenta en ese rango

#### Scenario: Rango invertido
- **WHEN** se pide `desde=2026-11-20&hasta=2026-11-01`
- **THEN** la API responde 400 con `SOLICITUD_INVALIDA`

#### Scenario: Cliente sin permiso
- **WHEN** un CLIENTE pide `GET /admin/reportes/asistente`
- **THEN** la API responde 403

### Requirement: Reporte de ventas
`GET /admin/reportes/ventas` SHALL devolver, para las órdenes creadas en el rango:
- el total vendido, como suma de los totales de las órdenes;
- el número de órdenes;
- el ticket promedio;
- los 10 productos más vendidos por unidades, cada uno con id, nombre, unidades e importe (unidades × precio unitario de la orden); el empate se ordena por importe;
- una serie con un punto por cada día del rango, con su total y su número de órdenes, incluidos los días sin ventas.

Los importes MUST ir como cadenas con dos decimales.

#### Scenario: Ventas en el rango
- **WHEN** en el rango hay dos órdenes, de S/ 1000.00 y S/ 500.00, y en la primera hay 2 unidades de un producto a S/ 300.00
- **THEN** el total es `"1500.00"`, hay 2 órdenes, el ticket promedio es `"750.00"`, y ese producto aparece con 2 unidades e importe `"600.00"`

#### Scenario: Día sin ventas
- **WHEN** el rango tiene 7 días y solo hubo ventas en 2
- **THEN** la serie tiene 7 puntos, y los 5 días sin ventas tienen total `"0.00"` y 0 órdenes

#### Scenario: Rango vacío
- **WHEN** no hay órdenes en el rango
- **THEN** el total es `"0.00"`, hay 0 órdenes, el ticket promedio es `"0.00"` y la lista de productos está vacía

### Requirement: Reporte del asistente
`GET /admin/reportes/asistente` SHALL devolver, para las consultas registradas en el rango:
- el número de consultas, cuántas usaron el respaldo y su porcentaje;
- la latencia promedio en milisegundos;
- la distribución por uso previsto: para cada uno de `OFICINA`, `ESTUDIO`, `GAMING`, `DISENO` y `OTRO`, sus consultas y su porcentaje de respaldo, incluidos los usos sin consultas;
- la distribución de los motivos de respaldo;
- los tokens de entrada y salida sumados;
- el costo estimado en US$ con el precio vigente del modelo.

Un rango sin consultas MUST devolver ceros, sin dividir entre cero.

#### Scenario: Consultas con y sin respaldo
- **WHEN** en el rango hay 4 consultas de `GAMING`, una de ellas con respaldo por `IA_TIMEOUT`, con latencias de 10, 12, 14 y 4 segundos
- **THEN** hay 4 consultas, 1 con respaldo (25 %), latencia promedio de 10 000 ms, `GAMING` con 4 consultas y 25 %, y el motivo `IA_TIMEOUT` con 1

#### Scenario: Costo estimado
- **WHEN** las consultas del rango suman 3038 tokens de entrada y 1167 de salida con Opus 5.5 (US$4 y US$20 por millón)
- **THEN** el costo estimado es US$0,0355 (redondeado a 4 decimales)

#### Scenario: Sin consultas
- **WHEN** no hay consultas en el rango
- **THEN** todos los conteos son 0, los porcentajes son 0 y la latencia promedio es 0

### Requirement: Pantallas de reportes
`/admin/reportes/ventas` y `/admin/reportes/asistente` SHALL tener un filtro de fechas, tarjetas con los indicadores, un gráfico de barras y una tabla con los mismos datos del gráfico:
- en ventas, el gráfico muestra el total por día y la tabla los productos más vendidos;
- en el asistente, el gráfico muestra las consultas por uso y la tabla los motivos de respaldo.

El filtro MUST reflejarse en la URL, para poder compartir o recargar el reporte. Las pantallas MUST tener estados de carga, vacío y error, y cumplir accesibilidad y el ancho de 360 px.

#### Scenario: Cambiar el rango
- **WHEN** el ADMIN elige del 2026-11-01 al 2026-11-07 y aplica el filtro
- **THEN** la URL incluye `desde=2026-11-01&hasta=2026-11-07`, y los indicadores, el gráfico y la tabla muestran ese rango

#### Scenario: Gráfico accesible
- **WHEN** un lector de pantalla recorre el reporte de ventas
- **THEN** encuentra los mismos valores del gráfico en una tabla con encabezados

#### Scenario: Sin datos
- **WHEN** el rango no tiene ventas
- **THEN** la pantalla muestra un mensaje de que no hay ventas en ese rango, en lugar de un gráfico vacío
