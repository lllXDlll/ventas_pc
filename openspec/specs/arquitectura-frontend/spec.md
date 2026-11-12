# arquitectura-frontend Specification

## Purpose
Fija cómo se organiza el código del frontend y qué capa puede depender de cuál, para que los componentes de presentación se reutilicen en los sprints siguientes sin arrastrar llamadas a la API ni lógica de pantalla.

## Requirements

### Requirement: Capas del frontend
El código del frontend SHALL organizarse en cuatro capas: rutas (`app`), funcionalidades (`features/<nombre>`), componentes compartidos (`components/ui` y `components/layout`) y utilidades (`lib`). Cada capa MUST importar solo de las capas inferiores a ella.

#### Scenario: Importación hacia arriba
- **WHEN** un archivo de `components/ui` importa de `features/` o de `app/`
- **THEN** el lint de la CI falla e indica la regla de capas

#### Scenario: Importación entre funcionalidades
- **WHEN** un archivo de `features/auth` importa de `features/catalogo`
- **THEN** el lint de la CI falla

### Requirement: Componentes de presentación sin acceso a datos
Los componentes de presentación SHALL recibir sus datos por props y MUST NOT llamar a la API ni leer el estado de la sesión por su cuenta. Solo los contenedores de cada funcionalidad leen datos.

#### Scenario: Tarjeta de producto reutilizada
- **WHEN** una pantalla muestra una tarjeta de producto con un producto recibido por props
- **THEN** la tarjeta se renderiza sin hacer ninguna petición a la API

### Requirement: Rutas que solo componen
Los archivos de rutas SHALL limitarse a componer contenedores y componentes y MUST NOT contener llamadas directas a la API.

#### Scenario: Revisión de una ruta
- **WHEN** el lint revisa los archivos de `app/`
- **THEN** ninguno importa el cliente HTTP directamente

### Requirement: Vitrina interna de componentes
El frontend SHALL ofrecer en `/dev/ui` una vitrina con todos los componentes base y sus variantes y estados (incluidos deshabilitado, carga y error). La vitrina MUST NOT enlazarse desde la navegación pública ni indexarse.

#### Scenario: Componentes en la vitrina
- **WHEN** se abre `/dev/ui`
- **THEN** se ven los botones principal, secundario, fantasma y con degradado, los campos, las insignias, las tarjetas, los esqueletos y los diálogos

#### Scenario: Vitrina fuera de los buscadores
- **WHEN** un buscador pide `/dev/ui`
- **THEN** la página indica `noindex`
