# Spec Delta

## ADDED Requirements

### Requirement: Escaneo de secretos
La verificación de cada push SHALL escanear el repositorio en busca de secretos. Entre ellos están:
- claves de API, incluida la de Anthropic;
- tokens de Cloudflare o del gateway;
- cadenas de conexión con contraseña;
- claves privadas.

Un hallazgo MUST hacer fallar la verificación y, en consecuencia, bloquear el despliegue. Los falsos positivos conocidos, como los valores de ejemplo de los archivos `.example` y las contraseñas de las pruebas locales, SHALL declararse en un archivo de excepciones versionado y no desactivando el escaneo.

#### Scenario: Secreto confirmado
- **WHEN** un commit agrega una cadena con forma de clave de API de Anthropic
- **THEN** el job de verificación falla, señala el archivo y la línea, y el despliegue no corre

#### Scenario: Historial limpio
- **WHEN** se escanea todo el historial al cerrar el Sprint 6
- **THEN** no hay hallazgos fuera de las excepciones declaradas
