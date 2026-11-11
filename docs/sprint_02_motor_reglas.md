# Sprint 2: Motor de reglas y armador manual (semana 3)

> Contexto previo: `00_parte_tecnica.md`. Implementa solo lo de este documento.

**Objetivo:** validar la compatibilidad de cualquier configuración y permitir el armado manual.
**Depende de:** Sprint 1 (catálogo con atributos técnicos, auth, roles).

## Diseño del motor (aplica a HU-09 a HU-13)
Servicio determinístico en `compatibilidad/`. Cada regla es una clase con interfaz común:
`validar(configuracion): { aprobado: boolean, codigo?: string, motivo?: string }`.
Los parámetros se leen de la tabla `reglas_compatibilidad`. Un orquestador ejecuta todas las reglas activas y agrega los rechazos. El mismo motor validará configuraciones manuales, las generadas por IA y las modificadas después de una recomendación.

**Las seis reglas del motor** (un registro en `reglas_compatibilidad` por código, una clase por regla):

| Código | Qué valida | Historia |
|---|---|---|
| `SOCKET` | Socket del procesador igual al de la placa madre | HU-09 |
| `RAM` | Tipo, velocidad y cantidad de módulos frente a la placa madre | HU-10 |
| `POTENCIA` | Consumo total más margen frente a la fuente | HU-11 |
| `DIMENSIONES` | Largo de GPU y alto de disipador frente al gabinete | HU-12 |
| `FACTOR_FORMA` | Factor de forma de la placa madre frente al gabinete | HU-12 |
| `ALMACENAMIENTO` | Interfaces de almacenamiento solicitadas frente a la placa madre | HU-12 |

La cantidad de módulos de RAM **no es una regla aparte**: pertenece a `RAM`. Esa regla puede devolver motivos distintos según el fallo (tipo, velocidad o exceso de módulos), pero con un único código de regla. Lo mismo aplica a `DIMENSIONES` (GPU y disipador). HU-12 agrupa tres reglas.

## HU-09 Validación de socket
**Como** cliente, **quiero** que el procesador y la placa madre tengan el mismo socket, **para** no comprar piezas que no encajan.
- Sockets distintos: rechazo que nombra ambos sockets.
- Sockets iguales: aprobado.

## HU-10 Validación de memoria RAM
**Como** cliente, **quiero** que se valide el tipo y la velocidad de la RAM contra la placa madre, **para** asegurar que funcione.
- Tipo o velocidad no soportados por la placa madre: rechazo con motivo.
- Cantidad de módulos mayor al límite de la placa madre: rechazo.

## HU-11 Validación de potencia de la fuente
**Como** cliente, **quiero** que la fuente soporte el consumo total, **para** evitar fallas por falta de potencia.
- Consumo total estimado + margen configurable (20 %) mayor a la potencia de la fuente: rechazo indicando consumo calculado y potencia disponible.
- Dentro del margen: aprobado.

## HU-12 Validación de dimensiones, factor de forma y almacenamiento
**Como** cliente, **quiero** que las piezas quepan en el gabinete, **para** no comprar piezas que no se pueden instalar.
- Largo de GPU o alto de disipador mayor al admitido por el gabinete: rechazo.
- Factor de forma de la placa no compatible con el gabinete: rechazo.
- Interfaz de almacenamiento solicitada no disponible en la placa madre: rechazo.

**Tareas comunes HU-09 a HU-12:** una clase por regla, registro en el orquestador, pruebas unitarias con casos válidos e inválidos por regla, semilla de reglas con sus parámetros.

## HU-13 Mensajes de rechazo comprensibles
**Como** cliente, **quiero** motivos claros de rechazo, **para** corregir mi configuración.

**Criterios de aceptación**
- Todo rechazo devuelve código de regla y mensaje en lenguaje claro.
- El mensaje nombra los componentes en conflicto y la característica que no coincide.
- Una configuración incompatible no puede avanzar al carrito.

**Tareas:** catálogo de mensajes por código, `POST /compatibilidad/validar` que devuelve la lista de rechazos, pruebas.

## HU-14 Armado manual de una PC
**Como** cliente, **quiero** elegir componentes y ver su compatibilidad en tiempo real, **para** armar con seguridad.

**Criterios de aceptación**
- Selección por categoría; estado de compatibilidad con lo ya elegido.
- Solo se ofrecen productos con stock disponible.
- Puedo guardar la configuración sin comprarla.
- Solo las configuraciones que pasan todas las reglas quedan marcadas como agregables al carrito.

**Tareas:** `POST /configuraciones`, `PATCH /configuraciones/:id`, `GET /configuraciones/:id`, persistencia en `configuraciones` y `configuracion_items` con origen MANUAL, interfaz de armado con validación en vivo.

## Definición de hecho del sprint
Las seis reglas (`SOCKET`, `RAM`, `POTENCIA`, `DIMENSIONES`, `FACTOR_FORMA`, `ALMACENAMIENTO`) con pruebas unitarias y sembradas en `reglas_compatibilidad`, armador manual funcional con rechazos explicados.
