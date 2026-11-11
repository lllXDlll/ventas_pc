# Spec Delta

## Purpose

Permite que un visitante cree una cuenta y que un usuario registrado inicie y cierre sesión de forma segura, con una sesión que el servidor puede revocar y que nunca se guarda en texto plano.

## ADDED Requirements

### Requirement: Registro de cuenta
El sistema SHALL crear una cuenta con rol CLIENTE y estado ACTIVO cuando recibe un correo con formato válido que no está registrado y una contraseña de al menos 8 caracteres. El correo MUST compararse sin distinguir mayúsculas. La respuesta MUST NOT incluir la contraseña ni su hash.

#### Scenario: Registro exitoso
- **WHEN** un visitante envía `POST /auth/registro` con un correo nuevo y una contraseña válida
- **THEN** la API responde 201 con el identificador, el correo y el rol CLIENTE de la cuenta creada

#### Scenario: Correo ya registrado
- **WHEN** un visitante se registra con un correo que ya existe, aunque cambien las mayúsculas
- **THEN** la API responde 409 con `{ codigo, mensaje }` y un mensaje que indica que el correo ya está registrado

#### Scenario: Datos inválidos
- **WHEN** el correo no tiene formato válido o la contraseña tiene menos de 8 caracteres
- **THEN** la API responde 400 con `{ codigo, mensaje }` indicando el campo inválido y no crea la cuenta

### Requirement: Contraseña guardada con hash
La contraseña SHALL guardarse solo como hash PBKDF2-SHA256, con una sal aleatoria propia de cada cuenta y en un formato que registre el algoritmo, las iteraciones y la sal, para poder cambiar los parámetros más adelante sin invalidar las cuentas existentes. Las iteraciones MUST ser 50.000 al crear o cambiar una contraseña.

#### Scenario: Hash almacenado
- **WHEN** se crea una cuenta
- **THEN** la base guarda un valor con formato `pbkdf2$50000$<sal>$<hash>` y nunca la contraseña en texto plano

#### Scenario: Verificación con parámetros anteriores
- **WHEN** un usuario cuya contraseña se guardó con otro número de iteraciones inicia sesión con la contraseña correcta
- **THEN** la verificación usa las iteraciones guardadas en su hash y acepta la contraseña

### Requirement: Inicio de sesión
Con credenciales correctas de una cuenta ACTIVA, el sistema SHALL crear una sesión y responder con una cookie que contiene un token aleatorio opaco. La sesión MUST guardar solo el hash del token y vencer a los `SESSION_TTL_DAYS` días (7 por defecto). En producción la cookie MUST ser `HttpOnly; Secure; SameSite=Lax; Domain=.xdtech.store`; en local, sin `Domain` ni `Secure`.

#### Scenario: Credenciales correctas
- **WHEN** un usuario envía `POST /auth/login` con su correo y su contraseña correctos
- **THEN** la API responde 200 con los datos públicos del usuario y una cabecera `Set-Cookie` con la sesión y sus atributos

#### Scenario: Token no guardado en claro
- **WHEN** se crea una sesión
- **THEN** la tabla de sesiones contiene el hash del token y no el valor enviado en la cookie

### Requirement: Error genérico ante credenciales incorrectas
Un inicio de sesión con un correo inexistente, una contraseña incorrecta o una cuenta BLOQUEADA SHALL responder 401 con el mismo mensaje genérico, sin revelar qué dato falló.

#### Scenario: Contraseña incorrecta
- **WHEN** un usuario inicia sesión con un correo existente y una contraseña incorrecta
- **THEN** la API responde 401 con el mismo `{ codigo, mensaje }` que para un correo inexistente

#### Scenario: Cuenta bloqueada
- **WHEN** una cuenta BLOQUEADA inicia sesión con la contraseña correcta
- **THEN** la API responde 401 con el mensaje genérico y no crea la sesión

### Requirement: Usuario actual
`GET /auth/me` SHALL devolver el identificador, el correo y el rol del usuario de la sesión enviada en la cookie, y 401 si no hay una sesión válida.

#### Scenario: Con sesión
- **WHEN** un usuario con sesión válida llama a `GET /auth/me`
- **THEN** la API responde 200 con su identificador, su correo y su rol

#### Scenario: Sin sesión
- **WHEN** se llama a `GET /auth/me` sin cookie o con un token desconocido
- **THEN** la API responde 401

### Requirement: Cierre de sesión
`POST /auth/logout` SHALL marcar la sesión como revocada y responder con una cookie que la borra. Una petición posterior con el mismo token MUST recibir 401.

#### Scenario: Cerrar sesión
- **WHEN** un usuario con sesión válida llama a `POST /auth/logout`
- **THEN** la API responde 204, la sesión queda revocada y la cabecera `Set-Cookie` vence la cookie

#### Scenario: Token después del cierre
- **WHEN** se usa el token de una sesión ya cerrada en `GET /auth/me`
- **THEN** la API responde 401

### Requirement: Sesiones vencidas o revocadas rechazadas
Una sesión vencida o revocada SHALL rechazarse con 401 en toda ruta que exija sesión, aunque todavía no se haya borrado de la base.

#### Scenario: Sesión vencida
- **WHEN** se usa un token cuya sesión venció pero sigue en la tabla
- **THEN** la API responde 401

### Requirement: Limpieza de sesiones al iniciar sesión
Al iniciar sesión correctamente, el sistema SHALL borrar las sesiones vencidas o revocadas de ese mismo usuario, sin tocar las sesiones válidas.

#### Scenario: Limpieza propia
- **WHEN** un usuario que tiene una sesión vencida y otra válida inicia sesión
- **THEN** la sesión vencida se borra, la válida se conserva y se crea la nueva

### Requirement: CORS con credenciales solo para el frontend
Las rutas de autenticación SHALL aceptar peticiones con credenciales solo desde el origen configurado del frontend, nunca con un comodín.

#### Scenario: Origen del frontend
- **WHEN** el frontend llama a `POST /auth/login` con `credentials: 'include'` desde su origen
- **THEN** la respuesta incluye `Access-Control-Allow-Origin` con ese origen y `Access-Control-Allow-Credentials: true`

#### Scenario: Origen ajeno
- **WHEN** otra página llama a la API con credenciales
- **THEN** la respuesta no incluye `Access-Control-Allow-Origin`

### Requirement: Pantallas de cuenta
El frontend SHALL ofrecer pantallas de registro y de inicio de sesión que muestren los mensajes de error de la API, y una opción para cerrar sesión cuando hay una sesión activa.

#### Scenario: Registro desde el navegador
- **WHEN** un visitante completa el formulario de registro con datos válidos
- **THEN** la cuenta se crea y la pantalla le indica que ya puede iniciar sesión

#### Scenario: Error visible
- **WHEN** el inicio de sesión falla
- **THEN** la pantalla muestra el mensaje genérico devuelto por la API
