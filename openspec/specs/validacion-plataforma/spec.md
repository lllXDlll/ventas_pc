# validacion-plataforma Specification

## Purpose

Mantiene un registro verificable de los supuestos de Cloudflare comprobados con pruebas y de las decisiones de plataforma tomadas a partir de ellos, de modo que ningún sprint se construya sobre un supuesto sin resultado OK o sin plan B documentado.

## Requirements

### Requirement: Registro de las nueve pruebas de compatibilidad
El proyecto SHALL mantener `docs/compatibilidad-cloudflare.md` con una fila por cada una de las nueve pruebas de HU-36b (NestJS en Workers, Next.js en Cloudflare, Prisma con Neon, almacén de disponibilidad, hash de contraseñas, cookie entre subdominios, IP real, Cron Trigger, subrequests). Cada fila MUST tener resultado (OK o no OK), medidas y decisión tomada.

#### Scenario: Registro completo
- **WHEN** se revisa el registro al cerrar el Sprint 0
- **THEN** las nueve pruebas tienen resultado, al menos una medida numérica cuando la prueba mide algo, y una decisión

#### Scenario: Prueba con resultado no OK
- **WHEN** una prueba da no OK
- **THEN** su fila documenta el plan B elegido y su motivo

### Requirement: Mediciones mínimas por prueba
El registro SHALL incluir al menos: tamaño del bundle, tiempo de arranque de una instancia nueva y CPU por petición de la API; latencia de Postgres a través de Hyperdrive con la base dormida y despierta, subrequests por consulta y la confirmación de que no se sirven lecturas desde caché; CPU del hash de contraseñas con los parámetros elegidos; latencia y consumo (comandos o filas escritas) por reserva de cada opción del almacén evaluada; y el número de subrequests de una reserva de ejemplo.

#### Scenario: Hash dentro del límite
- **WHEN** se mide el hash de contraseñas con los parámetros elegidos
- **THEN** el registro muestra su CPU en milisegundos y si queda por debajo de 10 ms

#### Scenario: Lectura inmediata tras escritura por Hyperdrive
- **WHEN** se escribe un valor en Postgres y se lee enseguida desde el Worker a través de Hyperdrive
- **THEN** la lectura devuelve el valor nuevo

#### Scenario: Subrequests de una reserva
- **WHEN** se ejecuta la reserva de ejemplo
- **THEN** el registro muestra cuántos subrequests consume y que son muchos menos de 50

### Requirement: Atomicidad del almacén de disponibilidad comprobada
Cada opción del almacén evaluada MUST demostrar que 300 intentos concurrentes de reservar un componente con 5 unidades producen exactamente 5 reservas, y que una reserva de varios productos es todo o nada.

#### Scenario: Competencia por 5 unidades
- **WHEN** 300 intentos concurrentes reservan una unidad del mismo componente con disponible 5
- **THEN** exactamente 5 tienen éxito y el disponible final es 0

#### Scenario: Reserva de varios productos con uno insuficiente
- **WHEN** se reserva un conjunto de productos y uno no tiene disponible suficiente
- **THEN** no se descuenta ninguno y la respuesta indica cuál faltó

### Requirement: Decisión del almacén registrada
El registro SHALL contener, antes de empezar el Sprint 1, la confirmación de la opción B (Durable Object en Cloudflare) elegida por el desarrollador, con los números que la justifican según la regla de la parte técnica; o, si B no pasa las pruebas, su descarte con motivo y la evaluación de la opción A.

#### Scenario: Opción B confirmada
- **WHEN** la prueba 4 de la opción B cumple atomicidad, latencia y cuota de filas escritas
- **THEN** el registro indica la opción B como confirmada, con sus medidas y el motivo

#### Scenario: Opción B descartada
- **WHEN** la prueba 4 de la opción B falla en alguno de esos criterios
- **THEN** el registro documenta el fallo, se evalúa la opción A con las mismas pruebas y se registra la decisión final

### Requirement: Decisiones de plataforma con plan B
Si NestJS, Next.js, Prisma con Neon por Hyperdrive, la cookie entre subdominios o `CF-Connecting-IP` no funcionan, el registro MUST documentar la alternativa elegida (Hono, Vercel, adaptador serverless de Neon, alternativa de sesión, encabezado alternativo) antes del Sprint 1.

#### Scenario: NestJS inviable en Workers
- **WHEN** la prueba 1 da no OK o un tamaño o arranque inaceptables
- **THEN** el registro documenta el paso a Hono y su motivo

### Requirement: Cookie entre subdominios comprobada en varios navegadores
La prueba de cookie SHALL confirmar que una cookie `httpOnly; Secure; SameSite=Lax; Domain=.xdtech.store` emitida por la API se envía de vuelta desde el frontend con credenciales, en Chrome y al menos en Safari o Firefox.

#### Scenario: Petición con credenciales desde el frontend
- **WHEN** el frontend llama a la API con credenciales después de recibir la cookie
- **THEN** la API recibe la cookie en Chrome y en el segundo navegador probado

### Requirement: IP real del cliente
La prueba de IP SHALL confirmar que la API recibe `CF-Connecting-IP` con la IP pública del cliente en una conexión real a `api.xdtech.store`, y documentar qué devuelve la IP del socket. Aunque coincida con `CF-Connecting-IP`, el sistema MUST NOT depender de la IP del socket, porque ese comportamiento no está documentado por Cloudflare.

#### Scenario: Encabezado presente
- **WHEN** un cliente real llama al endpoint temporal de IP
- **THEN** la respuesta muestra la IP pública del cliente tomada de `CF-Connecting-IP`

#### Scenario: IP del socket documentada
- **WHEN** se registra el resultado de la prueba
- **THEN** el registro de compatibilidad indica qué devolvió la IP del socket y que el sistema usa solo `CF-Connecting-IP`

### Requirement: Endpoints temporales eliminados
Los endpoints creados solo para las pruebas de cookie e IP MUST NOT quedar en el código al cerrar el Sprint 0.

#### Scenario: Cierre del sprint
- **WHEN** se llama a los endpoints temporales en la versión desplegada al cerrar el sprint
- **THEN** la API responde 404
