# Sprint 5: Asistente de IA (semana 6)

> Contexto previo: `00_parte_tecnica.md`. Implementa solo lo de este documento.

**Objetivo:** recomendaciones explicadas, siempre validadas, con respaldo determinístico.
**Depende de:** Sprint 4 (flujo de compra, historial de configuraciones), Sprint 2 (motor de reglas) y Sprint 1 (catálogo).

## Flujo del asistente (implementar tal cual)
1. El usuario indica presupuesto y uso (oficina, estudio, gaming, diseño u otro).
2. El backend filtra el catálogo a productos con stock disponible y preselecciona candidatos por categoría y rango de precio para limitar el tamaño de la consulta.
3. Llama al LLM con salida estructurada JSON: componentes elegidos y una explicación por cada uno.
4. Valida el formato de la respuesta y ejecuta el motor de reglas. Si hay incompatibilidades, reintenta **una vez** enviando los motivos del rechazo.
5. Si el reintento falla o la API no responde dentro del timeout, usa el armador determinístico por perfiles de uso, con explicaciones en plantilla. El usuario siempre recibe una configuración válida.
6. Registra cada consulta en `uso_asistente` (con latencia y si se usó el respaldo).

La IA solo recomienda: no participa en la concurrencia ni en el cobro. El proveedor va detrás de una interfaz `ProveedorIA` intercambiable; la clave se lee de variables de entorno.

## HU-27 Solicitar una recomendación
**Como** cliente, **quiero** indicar presupuesto y uso, **para** recibir una configuración sugerida.

**Criterios de aceptación**
- La recomendación usa solo componentes con stock disponible y no supera el presupuesto.
- Devuelve una configuración completa y compatible.

**Tareas:** `POST /asistente/recomendar`, preselección de candidatos, interfaz de presupuesto y uso.

## HU-28 Explicación de cada componente
**Como** cliente, **quiero** una explicación comprensible de cada componente, **para** entender y confiar en la recomendación.

**Criterios de aceptación**
- Cada componente incluye una explicación breve ligada al uso y al presupuesto.
- La respuesta del modelo se recibe en JSON estructurado y se valida contra un esquema antes de mostrarse.

**Tareas:** prompt del sistema, esquema de salida (zod o similar), validador de respuesta, pruebas con respuestas simuladas.

## HU-29 Validación de la recomendación y reintento
**Como** cliente, **quiero** que la IA nunca me muestre una configuración incompatible, **para** poder confiar en ella.

**Criterios de aceptación**
- Toda recomendación pasa por el motor de reglas antes de mostrarse.
- Si hay incompatibilidades, se hace un único reintento enviando al modelo los motivos del rechazo.
- Ninguna configuración incompatible llega al carrito, aunque venga de la IA.

**Tareas:** orquestador del asistente, prueba con un LLM simulado que devuelve una configuración inválida.

## HU-30 Respaldo determinístico
**Como** cliente, **quiero** recibir siempre una configuración válida aunque falle la IA, **para** no quedarme sin respuesta.

**Criterios de aceptación**
- Si el reintento falla o la API no responde en el timeout, se usa el armador por perfiles de uso.
- Las explicaciones del respaldo se generan con plantillas.
- Queda registrado que se usó el respaldo.

**Tareas:** `ArmadorDeterministico` por perfil de uso, timeout configurable, pruebas con la IA caída.

## HU-31 Modificación manual de la recomendación
**Como** cliente, **quiero** cambiar componentes de la configuración recomendada, **para** ajustarla a mis preferencias.

**Criterios de aceptación**
- Puedo reemplazar cualquier componente recomendado.
- Cada cambio se revalida con el motor de reglas; los rechazos muestran su motivo.
- La configuración se guarda con su origen indicado (IA).

**Tareas:** reutilizar `PATCH /configuraciones/:id`, interfaz de edición sobre la recomendación.

## HU-32 Límite de consultas y registro de uso
**Como** administrador, **quiero** limitar las consultas por usuario, **para** cuidar la cuota y el costo del servicio de IA.

**Criterios de aceptación**
- Si el usuario supera el límite, se le informa y no se llama al modelo.
- Cada consulta se registra con presupuesto, uso, resultado, latencia y si usó respaldo.

**Tareas:** límite por usuario calculado contando las filas de `uso_asistente` de las últimas 24 horas (10 consultas, configurable; no usar contadores en memoria, porque cada petición puede caer en una instancia distinta del Worker; se cuenta en Postgres para que el límite sea durable y no consuma cuota del almacén de disponibilidad), escritura en `uso_asistente`, adaptador `ProveedorIA` con la clave en variables de entorno.

## Definición de hecho del sprint
Recomendaciones explicadas y validadas, respaldo probado con la IA caída, límites activos.
