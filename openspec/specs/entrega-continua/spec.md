# entrega-continua Specification

## Purpose

Garantiza que cada cambio se verifique automáticamente y que lo que llega a la rama principal quede desplegado en Cloudflare con el esquema migrado, sin secretos en el repositorio.

## Requirements

### Requirement: Verificación en cada push
Cada push y cada pull request SHALL ejecutar instalación, lint, pruebas unitarias, pruebas de integración contra Postgres y el almacén locales levantados como servicios, y build. Un fallo en cualquier paso MUST marcar la ejecución como fallida.

#### Scenario: Push con pruebas en verde
- **WHEN** se hace push de un cambio cuyas pruebas pasan
- **THEN** la ejecución de CI termina en verde

#### Scenario: Push con una prueba rota
- **WHEN** se hace push de un cambio con una prueba que falla
- **THEN** la ejecución de CI termina en rojo y no se despliega nada

### Requirement: Despliegue desde la rama principal
Al fusionar en la rama principal con la verificación en verde, la CI SHALL aplicar las migraciones en Neon con la cadena directa y después desplegar la API y el frontend con Wrangler. Si las migraciones fallan, MUST NOT desplegar.

#### Scenario: Fusión en la rama principal
- **WHEN** se fusiona un cambio en la rama principal y la verificación pasa
- **THEN** se aplican las migraciones y luego se despliegan la API y el frontend

#### Scenario: Migración fallida
- **WHEN** la migración falla en la CI
- **THEN** el despliegue no se ejecuta y la versión anterior sigue en línea

#### Scenario: Push en otra rama
- **WHEN** se hace push a una rama distinta de la principal
- **THEN** se ejecuta la verificación pero no el despliegue

### Requirement: Secretos fuera del repositorio
El repositorio MUST NOT contener secretos. La configuración de Wrangler versionada SHALL contener solo valores no secretos; los secretos de producción viven en Cloudflare y en GitHub, y los locales en `.dev.vars`, que está ignorado por Git. Los archivos de ejemplo SHALL documentar todas las variables necesarias.

#### Scenario: Archivo local de secretos
- **WHEN** existe `.dev.vars` en la carpeta de la API
- **THEN** Git lo ignora y no aparece como archivo a confirmar

#### Scenario: Variables documentadas
- **WHEN** un desarrollador copia `.env.example` y `.dev.vars.example` y completa los valores
- **THEN** la API arranca en local sin variables faltantes, incluidas `COOKIE_DOMAIN`, `FRONTEND_ORIGIN` y `SESSION_TTL_DAYS`

### Requirement: Servicio por HTTPS en los dominios propios
La API SHALL responder por HTTPS con certificado válido en `api.xdtech.store`, y el frontend en su dominio configurado (o en su plan B documentado).

#### Scenario: Acceso al dominio de la API
- **WHEN** se llama a `https://api.xdtech.store/health/live`
- **THEN** la respuesta es 200 con un certificado válido

#### Scenario: Acceso al frontend
- **WHEN** se abre el dominio del frontend en el navegador
- **THEN** la página carga por HTTPS sin advertencias de certificado
