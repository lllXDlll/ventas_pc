# salud-api Specification

## Purpose

Permite saber si la API está viva y si sus dependencias críticas (Postgres y el almacén de disponibilidad) responden, para la CI, las pruebas de despliegue y la verificación manual.

## Requirements

### Requirement: Endpoint de vida sin dependencias
La API SHALL exponer `GET /health/live`, que responde 200 sin consultar ninguna dependencia externa, tanto en local (`wrangler dev`) como en `api.xdtech.store`.

#### Scenario: API viva con dependencias activas
- **WHEN** se llama a `GET /health/live` con Postgres y el almacén de disponibilidad activos
- **THEN** la respuesta es 200

#### Scenario: API viva con dependencias caídas
- **WHEN** se llama a `GET /health/live` con Postgres y el almacén de disponibilidad inaccesibles
- **THEN** la respuesta sigue siendo 200 y no se realiza ninguna llamada a esas dependencias

### Requirement: Endpoint de preparación con verificación de dependencias
La API SHALL exponer `GET /health/ready`, que verifica Postgres y el almacén de disponibilidad y responde 200 solo si ambos responden; si alguno falla o no responde dentro del tiempo de espera configurado, responde 503 indicando qué dependencia falló.

#### Scenario: Todas las dependencias activas
- **WHEN** se llama a `GET /health/ready` con Postgres y el almacén activos
- **THEN** la respuesta es 200 e informa ambas dependencias como correctas

#### Scenario: Postgres caído
- **WHEN** se llama a `GET /health/ready` con Postgres inaccesible
- **THEN** la respuesta es 503 e identifica a Postgres como la dependencia que falló

#### Scenario: Almacén de disponibilidad caído
- **WHEN** se llama a `GET /health/ready` con el almacén de disponibilidad inaccesible
- **THEN** la respuesta es 503 e identifica al almacén como la dependencia que falló

### Requirement: La respuesta de salud no expone secretos
Las respuestas de los endpoints de salud MUST NOT incluir cadenas de conexión, credenciales ni mensajes de error internos de las dependencias.

#### Scenario: Error de conexión con detalle sensible
- **WHEN** `GET /health/ready` falla porque la cadena de conexión de Postgres es inválida
- **THEN** la respuesta 503 indica solo el nombre de la dependencia y su estado, sin la cadena ni el mensaje del driver
