# Spec Delta

## MODIFIED Requirements

### Requirement: Pantallas de cuenta
El frontend SHALL ofrecer pantallas de registro y de inicio de sesión con validación en línea de los campos antes de enviar, que muestren los mensajes de error de la API, y una opción para cerrar sesión cuando hay una sesión activa. La pantalla de recuperación de acceso SHALL existir y enlazarse desde el inicio de sesión, pero MUST mostrar solo "Disponible pronto", sin formulario ni petición a la API, mientras HU-03 siga diferida.

#### Scenario: Registro desde el navegador
- **WHEN** un visitante completa el formulario de registro con datos válidos
- **THEN** la cuenta se crea y la pantalla le indica que ya puede iniciar sesión

#### Scenario: Error visible
- **WHEN** el inicio de sesión falla
- **THEN** la pantalla muestra el mensaje genérico devuelto por la API

#### Scenario: Validación en línea
- **WHEN** un visitante escribe un correo sin "@" o una contraseña de menos de 8 caracteres en el registro
- **THEN** el campo muestra el error junto a él y el formulario no se envía

#### Scenario: Recuperación de acceso
- **WHEN** un visitante pulsa "¿Olvidaste tu contraseña?" en el inicio de sesión
- **THEN** llega a `/recuperar`, que muestra "Disponible pronto" y no contiene campos ni envía peticiones
