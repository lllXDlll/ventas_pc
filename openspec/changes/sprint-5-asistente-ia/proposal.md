# Proposal

## Why

El cliente ya puede armar su PC a mano, comprarla y ver su historial. Lo que falta es la otra mitad de la propuesta del proyecto: un asistente que recomiende una configuración según el presupuesto y el uso (`docs/sprint_05_asistente_ia.md`).

Las recomendaciones deben venir explicadas y validadas por el motor de reglas. Además, el cliente tiene que recibir una configuración válida incluso cuando la IA falla. Hoy "Arma tu PC con IA" y "Armador IA" dicen "Disponible pronto".

## What Changes

**Recomendación (HU-27 y HU-28)**
- **`POST /asistente/recomendar`:** con sesión, recibe `{ presupuesto, uso }`; el uso es `OFICINA`, `ESTUDIO`, `GAMING`, `DISENO` u `OTRO`.
- **Preselección:** el backend filtra los productos activos con disponible > 0. Elige pocos candidatos por categoría según el rango de precio que el perfil de uso le asigna, para acotar el tamaño de la consulta.
- **Llamada a Claude:** pasa por **AI Gateway de Cloudflare** (decisión del usuario, para tener más control). Se usa el SDK oficial `@anthropic-ai/sdk` con salida estructurada (`output_config.format` con un esquema zod). El modelo devuelve los componentes elegidos y una explicación breve por componente, ligada al uso y al presupuesto.
  - **Modelo:** Claude Opus 5.5 (`claude-opus-5-5`, decisión del usuario). Cuesta US$4 por millón de tokens de entrada y US$20 por millón de salida, unos US$0,05 por consulta.
- **Configuración completa:** una configuración recomendada tiene los 7 componentes (procesador, placa, RAM, almacenamiento, fuente, gabinete y tarjeta gráfica). El catálogo no registra si un procesador trae gráficos integrados, así que la tarjeta gráfica siempre se incluye (decisión del desarrollador).
- **Presupuesto insuficiente:** si el presupuesto no alcanza para ninguna configuración completa y compatible, se responde 422 con el mínimo posible. En ese caso no se llama al modelo ni se gasta una consulta.

**Validación y reintento (HU-29)**
- **Antes de mostrar una respuesta:** se valida contra el esquema y se comprueba que:
  - los productos sean candidatos;
  - la configuración esté completa;
  - el total no supere el presupuesto;
  - haya stock;
  - el motor de reglas no tenga rechazos.
- **Reintento:** si algo falla, se reintenta **una vez** enviando los motivos al modelo.
- **Al carrito:** toda configuración que sale del asistente se guarda con origen `IA`, su presupuesto y su uso. Pasa por el mismo carrito que exige que sea agregable, así que ninguna incompatible llega al carrito.

**Respaldo determinístico (HU-30)**
- **`ArmadorDeterministico`:** arma por perfil de uso con el motor de reglas en memoria. Sus explicaciones salen de plantillas.
- **Cuándo se usa:**
  - si el reintento falla;
  - si la API no responde dentro de `IA_TIMEOUT_MS`;
  - si el modelo rechaza la consulta;
  - si el asistente está apagado o falta la configuración del gateway.
- **El cliente siempre recibe una configuración válida.** La respuesta indica si se usó el respaldo.

**Edición (HU-31)**
- **Sobre la recomendación:** "Editar en el armador" abre `/armador?config=<id>`. Cada cambio se revalida con `PATCH /configuraciones/:id` y la configuración conserva su origen `IA`, que el armador muestra con una insignia.

**Límite y registro (HU-32)**
- **Límite:** 10 consultas por usuario en 24 horas, configurable con `ASISTENTE_LIMITE_24H`. Se cuentan las filas de `uso_asistente` en Postgres, dentro de una transacción con bloqueo por usuario para que dos consultas simultáneas no lo superen.
- **Al superarlo:** se responde 429 con la hora en que vuelve a estar disponible, y no se llama al modelo.
- **Registro:** cada consulta guarda presupuesto, uso, resultado, latencia y si se usó el respaldo.
- **`GET /asistente/limite`:** devuelve las consultas usadas y las que quedan.

**Proveedor intercambiable**
- **Interfaz `ProveedorIA`:** tiene un adaptador de Anthropic y uno simulado. El simulado tiene escenarios (válida, inválida, inválida y luego válida, caída, lenta) para las pruebas y la CI, que nunca llaman a la API real.
- **AI Gateway `xdtech-ia`:** con autenticación y la clave de Anthropic guardada en el propio gateway (claves almacenadas), así que el Worker nunca la tiene.
  - El Worker solo tiene dos secretos que carga el usuario con `wrangler secret put`: la URL del gateway (`IA_GATEWAY_URL`, incluye el id de la cuenta) y su token (`CF_AIG_TOKEN`).
  - El gateway da registro de cada llamada, analíticas y un límite global de peticiones (20 por hora, deslizante) como tope de gasto.
- **Interruptor para apagar la IA** (proyecto académico, para evitar usos no previstos). Tres formas, y en todas el asistente sigue respondiendo con el respaldo:
  - la variable `IA_HABILITADA` en `"false"` (sin llamadas);
  - revocar el token o quitar la clave guardada en el panel del gateway;
  - el límite de peticiones del gateway, que corta el exceso con 429.

  AI Gateway no ofrece un botón de pausa según su documentación.

**Pantalla `/asistente`**
- **Formulario:** presupuesto y uso.
- **Resultado:** los componentes con sus explicaciones y el total. Indica si se usó el respaldo.
- **Acciones:** "Agregar al carrito" y "Editar en el armador".
- **Límite:** muestra las consultas restantes.
- **Accesos:** "Arma tu PC con IA" del inicio y "Armador IA" de la cabecera dejan de ser "Disponible pronto".

Fuera de este cambio:
- las ofertas y la administración (Sprint 6);
- conversaciones de varios turnos con el asistente;
- streaming de la respuesta.

## Capabilities

### New Capabilities

- `asistente`: recomendación por presupuesto y uso con candidatos en stock, salida estructurada validada, reintento único, respaldo determinístico, límite por usuario, registro de uso, proveedor intercambiable y su pantalla.

### Modified Capabilities

- `configuraciones`: una configuración de origen `IA` conserva su origen, su presupuesto y su uso al editarla.
- `armador`: muestra que la configuración vino del asistente.
- `sistema-diseno`: el asistente deja de ser una acción de un sprint futuro; solo quedan las ofertas.

## Impact

- **`apps/api`:**
  - módulo `asistente/` (`AsistenteService` orquestador, `PreseleccionService`, `ArmadorDeterministico`, `ProveedorIA` con los adaptadores Anthropic y simulado, el esquema zod y las plantillas);
  - `ConfiguracionesService` crea configuraciones de origen `IA`;
  - variables `IA_HABILITADA`, `IA_PROVEEDOR`, `IA_MODELO`, `IA_TIMEOUT_MS` y `ASISTENTE_LIMITE_24H`, y los secretos `IA_GATEWAY_URL` y `CF_AIG_TOKEN`;
  - dependencias nuevas `@anthropic-ai/sdk` y `zod`.
  - No hay migración: `uso_asistente` y los campos `origen`, `presupuesto` y `uso` de las configuraciones existen desde el Sprint 0.
- **`apps/web`:**
  - `features/asistente` y la ruta `/asistente`;
  - los accesos del inicio y de la cabecera;
  - la insignia de origen `IA` en el armador.
- **Pruebas:**
  - unitarias: esquema, validador, armador determinístico y preselección;
  - de integración con el proveedor simulado: válida, inválida con reintento, IA caída, timeout, límite, registro y presupuesto insuficiente;
  - e2e de la pantalla.
- **Costos y cuotas:**
  - unos US$0,05 por consulta con Opus 5.5, el doble si hay reintento; con el límite, como máximo unos US$1 por usuario al día;
  - la espera de red no cuenta para los 10 ms de CPU del plan gratuito;
  - cada consulta suma 1 subrequest al gateway, 2 si hay reintento, más 1 al Durable Object;
  - AI Gateway es gratuito en todos los planes; en el plan gratuito guarda hasta 100.000 registros por cuenta.
- **Configuración en Cloudflare (la hace el usuario):** crear el gateway, guardar ahí la clave de Anthropic, crear el token, activar el límite y cargar los dos secretos.
