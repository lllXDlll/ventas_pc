# autorizacion-roles Specification

## Purpose
Restringe las funciones administrativas al rol ADMIN y las funciones de cuenta a usuarios con sesión, de modo que ningún endpoint protegido dependa de controles en el frontend.

## Requirements

### Requirement: Rutas que exigen sesión
Toda ruta marcada como protegida SHALL responder 401 con `{ codigo: NO_AUTENTICADO, mensaje }` cuando la petición no trae una sesión válida.

#### Scenario: Sin cookie
- **WHEN** se llama a un endpoint administrativo sin cookie de sesión
- **THEN** la API responde 401 y no ejecuta la operación

### Requirement: Rutas administrativas solo para ADMIN
Todo endpoint bajo `/admin` SHALL exigir el rol ADMIN. Un usuario con sesión válida y rol CLIENTE MUST recibir 403 con `{ codigo: SIN_PERMISO, mensaje }`.

#### Scenario: Cliente en ruta administrativa
- **WHEN** un usuario CLIENTE con sesión válida llama a `POST /admin/productos`
- **THEN** la API responde 403 y no crea el producto

#### Scenario: Administrador en ruta administrativa
- **WHEN** un usuario ADMIN con sesión válida llama a un endpoint bajo `/admin`
- **THEN** la API ejecuta la operación

### Requirement: Rol leído del servidor
El rol SHALL obtenerse de la cuenta asociada a la sesión en el servidor en cada petición, nunca de un dato enviado por el cliente. Un cambio de rol o de estado MUST tener efecto en la siguiente petición.

#### Scenario: Cuenta bloqueada con sesión abierta
- **WHEN** una cuenta pasa a BLOQUEADA mientras tiene una sesión abierta
- **THEN** su siguiente petición protegida recibe 401

### Requirement: Administrador inicial
Debe existir un procedimiento reproducible para crear o actualizar el primer usuario ADMIN, con un correo y una contraseña que se pasan en el momento de ejecutarlo y que MUST NOT quedar en el repositorio.

#### Scenario: Semilla del administrador
- **WHEN** el desarrollador ejecuta la semilla con el correo y la contraseña del administrador
- **THEN** existe una cuenta ADMIN ACTIVA con ese correo, que puede iniciar sesión, y ejecutarla de nuevo no duplica la cuenta

### Requirement: Panel solo para administradores
El panel de administración del frontend SHALL mostrarse solo a usuarios con rol ADMIN. A los demás MUST indicarles que no tienen acceso, sin cargar los datos administrativos.

#### Scenario: Cliente abre el panel
- **WHEN** un usuario CLIENTE abre la página del panel
- **THEN** ve un aviso de que no tiene acceso y no se muestra ningún dato administrativo
