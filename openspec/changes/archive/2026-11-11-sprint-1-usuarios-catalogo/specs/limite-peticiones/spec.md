# Spec Delta

## Purpose

Limita los intentos de registro e inicio de sesión para frenar el abuso y la adivinación de contraseñas, con contadores consistentes entre todas las instancias del Worker y la IP real del cliente.

## ADDED Requirements

### Requirement: IP del cliente
El sistema SHALL identificar al cliente por el encabezado `CF-Connecting-IP`. MUST NOT usar `req.ip`, la IP del socket ni `X-Forwarded-For`. Si el encabezado falta (solo ocurre fuera de Cloudflare, por ejemplo en pruebas locales), todas esas peticiones MUST compartir una misma clave, sin dejar de aplicar el límite.

#### Scenario: Encabezado presente
- **WHEN** llega una petición con `CF-Connecting-IP: 203.0.113.7`
- **THEN** su clave de límite es la de `203.0.113.7`

#### Scenario: Encabezado ausente
- **WHEN** llegan peticiones de registro sin `CF-Connecting-IP`
- **THEN** cuentan contra una única clave compartida y el límite se sigue aplicando

### Requirement: IPv6 agrupada por prefijo /64
Las direcciones IPv6 SHALL contarse por su prefijo /64. Las direcciones IPv4 se cuentan completas.

#### Scenario: Misma red IPv6
- **WHEN** dos peticiones llegan desde `2800:200:ff80:240::1` y `2800:200:ff80:240:f4c0::28ff`
- **THEN** ambas cuentan contra el mismo contador

#### Scenario: Otra red IPv6
- **WHEN** una petición llega desde `2800:200:ff80:241::1`
- **THEN** cuenta contra un contador distinto del de `2800:200:ff80:240::/64`

### Requirement: Límite de registro por IP
El registro SHALL permitir hasta `LIMITE_REGISTRO_MAX` intentos por IP en una ventana de `LIMITE_REGISTRO_VENTANA_MIN` minutos (5 por cada 60 minutos, por defecto). Al excederlo, MUST responder 429 con `{ codigo, mensaje }` y la cabecera `Retry-After`, sin crear la cuenta.

#### Scenario: Sexto registro en la hora
- **WHEN** la misma IP envía su sexto `POST /auth/registro` dentro de la misma hora
- **THEN** la API responde 429 con `codigo: DEMASIADAS_PETICIONES` y `Retry-After`, y no crea la cuenta

#### Scenario: Ventana vencida
- **WHEN** pasa la ventana desde el primer intento contado
- **THEN** la IP puede volver a registrarse

### Requirement: Límite de inicio de sesión por correo
El inicio de sesión SHALL contar por correo solo los intentos fallidos, hasta `LIMITE_LOGIN_CORREO_MAX` en una ventana de `LIMITE_LOGIN_VENTANA_MIN` minutos (5 por cada 15, por defecto). Un inicio de sesión correcto MUST borrar el contador de ese correo. Al excederlo, MUST responder 429 sin verificar la contraseña.

#### Scenario: Seis fallos seguidos
- **WHEN** se hacen 5 intentos fallidos para un correo y llega un sexto intento dentro de la ventana
- **THEN** la API responde 429, aunque la contraseña del sexto intento sea correcta

#### Scenario: Acierto que reinicia
- **WHEN** después de 3 fallos el usuario inicia sesión correctamente
- **THEN** el contador de su correo vuelve a cero

### Requirement: Límite de inicio de sesión por IP
El inicio de sesión SHALL limitar además todos los intentos por IP, aciertos y fallos, hasta `LIMITE_LOGIN_IP_MAX` en la misma ventana (50 por cada 15 minutos, por defecto), y responder 429 al excederlo.

#### Scenario: Muchos correos desde una IP
- **WHEN** una IP envía 51 inicios de sesión en 15 minutos, cada uno con un correo distinto
- **THEN** el intento 51 recibe 429

### Requirement: Contadores compartidos y no en memoria
Los contadores SHALL ser consistentes para todas las instancias del Worker: dos peticiones simultáneas de la misma clave MUST contar dos intentos. MUST NOT guardarse en la memoria del Worker ni en un almacén eventualmente consistente.

#### Scenario: Peticiones concurrentes
- **WHEN** llegan a la vez 10 registros desde la misma IP con el límite en 5
- **THEN** exactamente 5 se procesan y 5 reciben 429

### Requirement: Límites configurables
Los máximos y las ventanas SHALL leerse de variables de entorno, con los valores por defecto de la sección 7 de la parte técnica.

#### Scenario: Valor configurado
- **WHEN** `LIMITE_REGISTRO_MAX` vale 2 en el entorno
- **THEN** el tercer registro desde la misma IP dentro de la ventana recibe 429
