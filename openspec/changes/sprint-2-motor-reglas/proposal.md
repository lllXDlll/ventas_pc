# Proposal

## Why

La diferencia de XDTech frente a otras tiendas es que valida la compatibilidad de las piezas antes de la compra. Hoy el catálogo guarda los atributos técnicos (fijados en el Sprint 1), pero nada los usa. El Sprint 2 (`docs/sprint_02_motor_reglas.md`) construye el motor de reglas, que valida cualquier configuración, y el armador manual. Sobre ese motor se apoyarán el carrito (Sprint 3) y el asistente de IA (Sprint 5).

## What Changes

**Motor de reglas (HU-09 a HU-13)**
- **Seis reglas en `compatibilidad/`, cada una una clase con la misma interfaz:**
  - `SOCKET`;
  - `RAM`: tipo, velocidad y cantidad de módulos;
  - `POTENCIA`: consumo más margen frente a la fuente;
  - `DIMENSIONES`: largo de la GPU y alto del disipador;
  - `FACTOR_FORMA`;
  - `ALMACENAMIENTO`.
- **Parámetros desde `reglas_compatibilidad`:** cada regla los lee de esa tabla (por ejemplo, el margen de potencia del 20 %). Una regla inactiva no se evalúa.
- **Orquestador puro:** ejecuta las reglas activas y junta los rechazos. Cada rechazo trae el código de la regla, un mensaje claro que nombra los componentes en conflicto y la característica que no coincide, y los productos involucrados.
- **`POST /compatibilidad/validar` (público):** recibe productos y cantidades y devuelve los rechazos. El armador la usa para validar en vivo.
- **Semilla de reglas:** carga las seis con sus parámetros. Es idempotente y no pisa los parámetros ya ajustados. Corre en el despliegue, junto con las categorías.

**Configuraciones (HU-14)**
- **Endpoints con sesión:**
  - `POST /configuraciones` y `PATCH /configuraciones/:id` guardan la configuración con origen MANUAL;
  - `GET /configuraciones/:id` la lee, y solo el dueño puede hacerlo;
  - `GET /configuraciones` lista las propias, para retomar un armado.
- **Validación al guardar:** el estado queda `VALIDA` si no hay rechazos e `INVALIDA` si los hay.
- **Agregable al carrito:** sin rechazos, con al menos un producto, y con todos sus productos activos y con disponible suficiente.
- **Composición:** a lo sumo un procesador, una placa madre, una fuente, un gabinete y una tarjeta gráfica. RAM y almacenamiento admiten varios. Los equipos armados no entran en una configuración.

**Armador manual (pantalla `/armador`)**
- Elegir por categoría entre los productos con stock, ver el estado de compatibilidad en vivo con los motivos, el total, y guardar la configuración (pide iniciar sesión).
- Los accesos "Arma tu PC" y "Usar en mi armado", que en el Sprint 1.5 decían "Disponible pronto", pasan a funcionar. "Armador IA", el carrito y las ofertas siguen como "Disponible pronto".

**Atributos técnicos** (decisiones del desarrollador al planificar)
- **`velocidadRamMaxMhz`:** nuevo atributo obligatorio de PLACA_MADRE (entero), para validar la velocidad de la RAM (HU-10). La semilla lo completa en las placas de ejemplo.
- **`altoDisipadorMm`:** atributo **opcional** de PROCESADOR (entero positivo si está), con el disipador incluido. DIMENSIONES lo compara con el gabinete solo si existe, porque no hay una categoría de disipadores.

Fuera de este cambio:
- el carrito y la reserva (Sprint 3);
- el asistente de IA (Sprint 5);
- la administración de reglas desde el panel (los parámetros se cambian por SQL o con la semilla);
- borrar configuraciones.

## Capabilities

### New Capabilities

- `motor-compatibilidad`: reglas de compatibilidad, sus parámetros en la base, el orquestador, los mensajes de rechazo y el endpoint de validación.
- `configuraciones`: guardar, actualizar, leer y listar configuraciones de un usuario, con su estado de validación y si son agregables al carrito.
- `armador`: pantalla de armado manual con selección por categoría y validación en vivo.

### Modified Capabilities

- `catalogo`:
  - atributos obligatorios de la placa madre con `velocidadRamMaxMhz` y atributo opcional `altoDisipadorMm` del procesador, ambos validados;
  - el catálogo de ejemplo con esos datos.
- `sistema-diseno`: el armado manual deja de ser una acción de un sprint futuro.

## Impact

- **`apps/api`:**
  - módulo `compatibilidad/` con las reglas, el orquestador, los mensajes, el servicio y el controlador;
  - módulo `configuraciones/`;
  - `catalogo/atributos.ts`, con el atributo nuevo y los opcionales;
  - las semillas: reglas y atributos nuevos en el catálogo de ejemplo.
  - Las tablas ya existen desde el Sprint 0, así que no hay migración.
- **`apps/web`:**
  - `features/armador`;
  - la ruta `/armador`;
  - `lib/atributos.ts`, que es la copia de la API;
  - los accesos del shell y del detalle.
- **CI:** el paso de semilla del despliegue también carga las reglas.
- **Pruebas:**
  - unitarias por regla, con casos válidos e inválidos;
  - de integración del endpoint de validación y de las configuraciones;
  - e2e del armador.
- **Datos en Neon:** hay que volver a correr `semilla:catalogo` para completar `velocidadRamMaxMhz` en las placas de ejemplo.
