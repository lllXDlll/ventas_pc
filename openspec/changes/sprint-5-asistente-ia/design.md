# Design

## Context

- **Motor de reglas:** es puro. `compatibilidad/motor/orquestador.ts` exporta `evaluar(piezas, configuracion)`, sin Prisma ni Nest. Su comentario ya prevé reutilizarlo en la IA. `CompatibilidadService.evaluar(items)` lo envuelve: lee los productos y las reglas vigentes con una consulta.
- **Configuraciones:** el modelo `Configuracion` ya tiene `origen` (`MANUAL | IA`), `presupuesto` y `uso`, pero `ConfiguracionesService.crear` fija `origen: 'MANUAL'`. `VistaConfiguracion` devuelve `origen` y no devuelve `presupuesto` ni `uso`. `PATCH /configuraciones/:id` reemplaza los ítems sin tocar el origen.
- **Uso del asistente:** la tabla `uso_asistente` existe (`usuarioId`, `presupuesto`, `uso`, `resultado` JSONB, `latenciaMs`, `usoRespaldo`, `creadoEn`) con un índice `[usuarioId, creadoEn]`. La carpeta `src/asistente/` solo tiene `.gitkeep`.
- **Disponible:** `DisponibleService.disponibles(ids)` lee el disponible de muchos productos en 1 llamada al Durable Object.
- **Frontend:**
  - `ACCESOS` (`components/layout/accesos.ts`) tiene "Armador IA" con `href: null`, y el inicio muestra `<BotonProximamente variante="degradado">` "Arma tu PC con IA";
  - el armador reabre configuraciones con `?config=<id>`;
  - `useAgregarAlCarrito` (`lib/carrito.ts`) acepta `{ configuracionId }`.
- **Plataforma:**
  - plan gratuito con 10 ms de CPU por petición; la espera de red no cuenta;
  - 50 subrequests;
  - no hay estado en memoria entre peticiones.
- **AI Gateway de Cloudflare** (documentación consultada el 2026-11-12):
  - URL base para Anthropic: `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic`, usada como `baseURL` del SDK;
  - autenticación con el encabezado `cf-aig-authorization: Bearer <token>`, obligatoria en los gateways nuevos;
  - con claves almacenadas (BYOK) se omite `x-api-key` (`apiKey` de relleno y `"x-api-key": null`), y el gateway usa la clave guardada;
  - límite de peticiones propio (fijo o deslizante, responde 429), registros y analíticas, gratis en todos los planes;
  - un token con permiso Run sirve para todos los gateways de la cuenta;
  - no menciona límites de gasto ni un botón de pausa.
- **API de Claude:**
  - SDK oficial `@anthropic-ai/sdk` (TypeScript, basado en `fetch`, compatible con Workers);
  - salida estructurada con `client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })`;
  - modelo `claude-opus-5-5` (decisión del usuario): US$4 de entrada y US$20 de salida por millón de tokens, 1M de contexto;
  - en Opus 5.5 el pensamiento siempre está activo, y el esfuerzo se controla con `output_config.effort` (por defecto `medium`);
  - con salida estructurada, Opus 5.5 rechaza el relleno del asistente (prefill) y el `tool_choice` forzado.

## Goals / Non-Goals

**Goals:**
- Una recomendación siempre válida (completa, compatible, en stock y dentro del presupuesto), explicada y guardada con origen `IA`.
- Un único reintento con los motivos, respaldo determinístico por perfil y registro de cada consulta.
- Un límite durable por usuario, sin carreras.
- Pruebas y CI sin llamar a la API real.

**Non-Goals:**
- Conversación de varios turnos, streaming al navegador o recomendar equipos armados.
- Aprender de compras previas o personalizar por historial.
- Optimizar el costo con otro modelo: el usuario eligió Opus 5.5. El esfuerzo se ajusta, no el modelo.

## Decisions

### D1. Módulo `asistente/`

| Archivo | Contenido |
|---|---|
| `proveedor.ts` | Interfaz `ProveedorIA { recomendar(solicitud, opciones): Promise<ResultadoIA> }` y sus tipos. El orquestador elige el adaptador por `IA_PROVEEDOR` en cada consulta, sin token de Nest: así el simulado recibe las reglas de esa consulta |
| `proveedor-anthropic.ts` | Adaptador de la API de Claude (D3) |
| `proveedor-simulado.ts` | Escenarios para las pruebas (D9) |
| `esquema.ts` | Esquema zod de la respuesta y el validador (D4) |
| `preseleccion.ts` | Función pura: candidatos por categoría y perfil (D2) |
| `armador-deterministico.ts` | Función pura: búsqueda con poda por perfil (D5) |
| `plantillas.ts` | Explicaciones del respaldo |
| `perfiles.ts` | Reparto del presupuesto por uso |
| `asistente.service.ts` | Orquestador (D6) |
| `limite.service.ts` | Límite de consultas (D7) |
| `asistente.controller.ts` | Endpoints |

Las funciones puras se prueban en el proyecto `unit` (Node), sin workerd.

### D2. Perfiles y preselección

**`perfiles.ts`** reparte el presupuesto por categoría según el uso:

| Uso | Procesador | Tarjeta gráfica | Placa | RAM | Almacenamiento | Fuente | Gabinete |
|---|---|---|---|---|---|---|---|
| `GAMING` | 0,20 | 0,40 | 0,12 | 0,09 | 0,07 | 0,07 | 0,05 |
| `DISENO` | 0,26 | 0,30 | 0,12 | 0,12 | 0,08 | 0,07 | 0,05 |
| `OFICINA` y `ESTUDIO` | 0,28 | 0,14 | 0,16 | 0,12 | 0,12 | 0,10 | 0,08 |
| `OTRO` | 0,24 | 0,26 | 0,14 | 0,11 | 0,09 | 0,09 | 0,07 |

**Lectura del catálogo:** una sola consulta trae los componentes activos con categoría, precio y atributos (sin equipos armados). Después, 1 llamada al Durable Object trae su disponible, y quedan los que tienen disponible > 0.

**`preseleccionar(productos, presupuesto, uso)`:**
- Por categoría, toma hasta 5 candidatos: los 4 de precio más cercano a `presupuesto × reparto`, más el más barato. Así siempre hay una solución mínima.
- Cada candidato recibe un alias corto (`C1`, `C2`…). El modelo responde con alias, no con UUID: menos tokens y ningún id inventado que parezca válido.

### D3. Adaptador de Claude

```ts
const cliente = new Anthropic({
  baseURL: env.IA_GATEWAY_URL,     // secreto: …/v1/{cuenta}/xdtech-ia/anthropic
  apiKey: 'byok',                  // relleno: la clave real está guardada en el gateway
  defaultHeaders: { 'x-api-key': null, 'cf-aig-authorization': `Bearer ${env.CF_AIG_TOKEN}` },
  maxRetries: 0,
  timeout: timeoutMs,
});
const r = await cliente.messages.parse({
  model: env.IA_MODELO,            // 'claude-opus-5-5'
  max_tokens: 4000,
  output_config: { format: zodOutputFormat(RespuestaSchema), effort: 'low' },
  system: SISTEMA,                 // fijo: rol, reglas de salida, sin datos variables
  messages: [{ role: 'user', content: solicitudConCandidatos }, ...reintento],
});
```

- **Por AI Gateway** (decisión del usuario): registros, analíticas y un límite global quedan en el panel de Cloudflare, y la clave de Anthropic nunca llega al Worker. Si "Require provider credentials" no encuentra la clave guardada, el gateway responde el error 2044, que va al respaldo como `IA_NO_DISPONIBLE`.
- **Un cliente por isolate.** El SDK solo guarda configuración, no E/S, así que no tiene el problema de la conexión de Postgres.
- **`maxRetries: 0`:** el orquestador controla el único reintento, y un reintento oculto del SDK duplicaría la espera.
- **`timeout`:** sale de `IA_TIMEOUT_MS` (por defecto 20000) para cada intento.
- **Esfuerzo `low`:** el pensamiento no se puede apagar en Opus 5.5. La tarea es elegir entre ~35 candidatos ya filtrados, y `low` reduce la latencia y el costo. Se mide en la tarea 5.4 y se sube a `medium` si las explicaciones o la tasa de reintento empeoran. Es un ajuste de esfuerzo, no un cambio de modelo.
- **`max_tokens: 4000`:** cubre 7 explicaciones de 300 caracteres y el pensamiento con esfuerzo bajo. Un corte por `max_tokens` o `parsed_output === null` cuenta como respuesta inválida.
- **Rechazos (`stop_reason: "refusal"`):** van al respaldo. El SDK 1.8 admite `fallbacks` en `beta.messages.parse`, pero **no se activa** (decisión de la implementación): no está verificado que AI Gateway reenvíe el encabezado beta, y un 400 por ese motivo mandaría todas las consultas al respaldo. El respaldo determinístico cubre los rechazos.
- **Errores tipados del SDK:**
  - `APIConnectionTimeoutError`, `APIConnectionError`, `RateLimitError`, `InternalServerError` y otros `APIError` van al respaldo con el motivo `IA_NO_DISPONIBLE`.
  - `AuthenticationError` (token del gateway revocado o inválido) va al respaldo con `IA_SIN_AUTORIZACION` y un log sin secretos.
  - El 429 del límite del gateway es un `RateLimitError` y va al respaldo con `IA_NO_DISPONIBLE`.
- **Sin configuración** (`IA_GATEWAY_URL` o `CF_AIG_TOKEN` vacíos): el adaptador ni se llama, con el motivo `IA_SIN_CONFIGURAR`.
- **Reintento:** se agrega la respuesta anterior como mensaje `assistant` y un `user` con «La configuración anterior no es válida: <motivos>. Elige de nuevo solo entre los candidatos.».
- **Caché de prompts:** no se usa. El prefijo fijo es corto (por debajo del mínimo cacheable), y los candidatos cambian por consulta.

### D4. Esquema y validación

**Esquema zod `RespuestaSchema`:**

```
{
  componentes: [{ alias: /^C\d+$/, cantidad: 1..4, explicacion: 1..300 caracteres }] (de 7 a 10),
  resumen: hasta 400 caracteres
}
```

**`validarRecomendacion(respuesta, candidatos, presupuesto, reglas)`** es pura y devuelve `{ ok, items, motivos[] }`. Junta los motivos en este orden:
1. alias desconocido;
2. categorías faltantes o repetidas: una por categoría única, y al menos una RAM y un almacenamiento;
3. cantidad mayor que el disponible;
4. total mayor que el presupuesto;
5. rechazos del motor `evaluar` con las reglas vigentes, con su mensaje.

Las reglas activas y sus parámetros se leen una vez por consulta, en la misma lectura del catálogo. Las mismas funciones validan la IA y el respaldo.

### D5. Armador determinístico

**`armar(productos, presupuesto, uso, reglas)`** es pura. Hace una búsqueda en profundidad en este orden: procesador → placa compatible (socket) → RAM (tipo, velocidad, módulos) → tarjeta gráfica → gabinete (factor de forma, largo de la tarjeta, alto del disipador) → almacenamiento (interfaz) → fuente (potencia con margen).

- **Orden de los candidatos:** en cada categoría se ordenan por cercanía al objetivo del perfil (D2), con preferencia por el más caro que no supera el objetivo.
- **Poda:** se descarta una rama si `costo parcial + suma de los mínimos de las categorías restantes > presupuesto`, o si el motor rechaza las piezas parciales. El motor es puro, y una evaluación parcial cuesta microsegundos.
- **Límite de nodos:** como máximo 5000, para acotar la CPU (objetivo: menos de 3 ms con el catálogo actual de ~70 productos). Se mide en una prueba unitaria.
- **Mínimo:** `minimo(...)` hace la misma búsqueda ordenada por precio ascendente y da el presupuesto mínimo del 422.
- **Explicaciones:** las da `plantillas.ts` por categoría y uso, por ejemplo: «Para gaming dedicamos la mayor parte del presupuesto a la {nombre}: {atributo clave} para jugar en alta calidad.».

### D6. Orquestador `AsistenteService.recomendar(usuarioId, { presupuesto, uso }, escenario?)`

1. **Leer catálogo, disponible y reglas.** Si el respaldo no encuentra solución con todo el catálogo disponible, responde **422** `PRESUPUESTO_INSUFICIENTE` con `detalle.minimo`. No se reserva la consulta.
2. **Reservar la consulta (D7).** Si ya no hay cupo, responde **429**.
3. **`preseleccionar`, y `proveedor.recomendar`** con `timeout`. Se valida la respuesta. Si no es válida y fue la primera, se reintenta una vez con los motivos.
4. **Si la IA no dio una válida,** `armar` con el catálogo disponible: `respaldo = true`, más el motivo.
5. **Guardar la configuración:** `ConfiguracionesService.crearDesdeAsistente(usuarioId, items, { presupuesto, uso })`, con origen `IA` y estado calculado con `CompatibilidadService.evaluar` en modo estricto (doble control antes de guardar).
6. **Completar el registro de uso:**
   - `resultado = { configuracionId, explicaciones, resumen, motivo?, intentos }`;
   - `latenciaMs`, medida desde el paso 2;
   - `usoRespaldo`.
7. **Responder 201:**

```
{ configuracion: VistaConfiguracion, explicaciones: { [productoId]: texto }, resumen, respaldo, consultas: { usadas, limite } }
```

Si el guardado falla en el paso 5, el registro de uso se completa con el error y la consulta cuenta igual, porque el modelo ya se llamó.

### D7. Límite sin carreras (`LimiteAsistenteService`)

Una transacción corta, con `conTransaccion` del Sprint 4:
1. `SELECT pg_advisory_xact_lock(hashtextextended(usuarioId, 0))` serializa las consultas del mismo usuario y no bloquea a otros;
2. `count(*)` de `uso_asistente` del usuario con `creado_en > now() - interval '24 hours'`;
3. si `>= ASISTENTE_LIMITE_24H`, se lanza 429 `LIMITE_ASISTENTE` con `detalle.disponibleDesde` = `min(creado_en) + 24 h` de las filas de la ventana;
4. si no, se inserta la fila con `latencia_ms = 0` y `resultado = null`, y se devuelve su id.

Así dos consultas simultáneas con 9 previas dan 10, nunca 11. La fila se actualiza en el paso 6 de D6.

`GET /asistente/limite` hace el mismo `count` sin bloqueo.

### D8. Configuraciones y armador

- **`ConfiguracionesService`:**
  - gana `crearDesdeAsistente(usuarioId, items, { presupuesto, uso })`;
  - `VistaConfiguracion` agrega `presupuesto` (texto o `null`) y `uso`;
  - `actualizar` ya conserva el origen, y se agrega una prueba.
- **Armador (frontend):** si la configuración cargada con `?config=` tiene origen `IA`, el resumen muestra la insignia `ia` (variante existente del `Badge`) "Recomendada por IA", con el presupuesto y el uso.

### D9. Proveedor simulado y configuración

- **Variables:**
  - `IA_PROVEEDOR`: `anthropic` en `wrangler.jsonc` (producción) y `simulado` en `.dev.vars.example`, en el e2e y en el arnés de integración;
  - `IA_MODELO`: `claude-opus-5-5`;
  - `IA_TIMEOUT_MS`: `20000`;
  - `ASISTENTE_LIMITE_24H`: `10`;
  - `IA_HABILITADA`: `"true"`;
  - `IA_GATEWAY_URL` y `CF_AIG_TOKEN`: secretos, nunca en `vars`.
- **`ProveedorSimulado` elige el escenario por el encabezado `x-ia-simulado`.** Solo se lee cuando `IA_PROVEEDOR=simulado`; en producción se ignora. Así un solo arnés de pruebas cubre todos los escenarios. Escenarios:
  - `valida` (por defecto): usa `armar` sobre los candidatos y explicaciones fijas;
  - `invalida`: cambia la placa por una de otro socket;
  - `invalida-luego-valida`;
  - `json-invalido`: le falta una explicación;
  - `caida`: lanza un error de API;
  - `lenta`: espera más que `IA_TIMEOUT_MS`; en las pruebas el timeout se baja a 1500 ms con `vars`.

  Cuenta las llamadas en el `resultado.intentos` del registro, lo que permite comprobar "exactamente dos llamadas".

### D10. Interruptor y control de uso

Tres capas, de la más inmediata a la más fina:
1. **`IA_HABILITADA`** (`"true"` en `wrangler.jsonc`): cualquier otro valor hace que el orquestador use el respaldo sin llamar al proveedor (motivo `IA_DESACTIVADA`). Se cambia con un despliegue, o en el panel del Worker hasta el siguiente despliegue.
2. **Panel de AI Gateway:** revocar el token o quitar la clave guardada corta todas las llamadas al instante; las consultas caen al respaldo con `IA_SIN_AUTORIZACION` o `IA_NO_DISPONIBLE`.
3. **Límite global del gateway:** 20 peticiones por hora, deslizante. Junto con el límite de 10 por usuario al día, acota el gasto a ~US$1 por hora aunque se creen muchas cuentas.

El límite por usuario sigue contando aunque la IA esté apagada, porque protege también la CPU y la base. Un interruptor desde el panel de administración queda para el Sprint 6.

### D11. Frontend `features/asistente`

- **Ruta `/asistente`:** formulario no controlado, como el de pago. El presupuesto es numérico y el uso se elige con botones de opción accesibles, con una descripción por perfil.
- **Envío:** `useMutation` a `POST /asistente/recomendar`. Mientras espera muestra el estado «Armando tu PC…», porque la espera puede ser de 10 a 20 s.
- **Resultado:**
  - tarjetas por componente con nombre, precio y explicación;
  - el total frente al presupuesto y el resumen;
  - la insignia `ia`, o «Recomendación de respaldo (sin IA)» con la variante `neutra`;
  - botones "Agregar al carrito" (`useAgregarAlCarrito({ configuracionId })` y navegación a `/carrito`) y "Editar en el armador" (`/armador?config=<id>`).
- **Errores:** el 422 muestra el mínimo, y el 429 muestra «Vuelves a tener consultas a las HH:MM». `GET /asistente/limite` muestra «Te quedan N de 10 consultas hoy».
- **Accesos:**
  - `ACCESOS['Armador IA'].href = '/asistente'`;
  - en el inicio, "Arma tu PC con IA" pasa a ser un `Link` con la variante `degradado` (el único uso permitido del degradado de marca);
  - `features/asistente` se agrega a `FUNCIONALIDADES` de ESLint.

### D12. Pruebas

- **Unitarias (Node):**
  - el esquema y el validador, cubriendo cada motivo;
  - `preseleccionar`: siempre incluye el más barato y no incluye productos sin disponible;
  - `armar` en los 5 perfiles: válida, dentro del presupuesto, que en gaming la tarjeta gráfica pese más que en oficina, el mínimo y el tiempo de CPU;
  - las plantillas;
  - `ProveedorAnthropic` con un `fetch` simulado inyectado en el SDK (opción `fetch` del cliente), para comprobar el cuerpo enviado (modelo, `output_config`, sin clave en logs) y el mapeo de errores (incluidos 401 del gateway y 429 de su límite), la URL y los encabezados del gateway (`cf-aig-authorization`, sin `x-api-key`), sin red.
- **Integración (arnés, `IA_PROVEEDOR=simulado`):**
  - el escenario válido: 201, origen `IA`, `VALIDA` y agregable;
  - `invalida-luego-valida`: 2 intentos y sin respaldo;
  - `invalida` y `json-invalido`: respaldo con 2 intentos;
  - `caida` y `lenta`: respaldo y latencia acotada;
  - `IA_HABILITADA=false` (segundo worker del arnés con esa variable): respaldo, ninguna llamada al proveedor y motivo `IA_DESACTIVADA`;
  - el 422 sin consumir cupo;
  - el límite: el undécimo da 429, y dos simultáneas con 9 previas dan exactamente 10;
  - `GET /asistente/limite`;
  - el registro con latencia y respaldo;
  - `PATCH` que conserva el origen `IA`;
  - el 401 sin sesión.
- **E2e:**
  - el flujo `/asistente` → recomendación → "Agregar al carrito", y "Editar en el armador" con la insignia;
  - el 429 visible cuando el límite de la prueba es bajo;
  - los accesos;
  - axe y 360 px en `/asistente`.
  - Un `@humo` en producción abre `/asistente` sin enviar, para no gastar cuota.
- **Producción:** una consulta real de verificación, con la clave cargada por el usuario, para medir latencia, tokens y costo. Se anota en `docs/compatibilidad-cloudflare.md`.

## Risks / Trade-offs

- **Latencia de Opus 5.5 (10 a 20 s, hasta ~40 s con reintento):** se usa esfuerzo `low`, el timeout es configurable y la pantalla muestra el progreso. Si la medición en producción supera el timeout con frecuencia, se sube `IA_TIMEOUT_MS` o se vuelve a preguntar al usuario por el modelo.
- **Costo (~US$0,05 por consulta, el doble con reintento):** lo acota el límite de 10 por día. Las pruebas y la CI usan el simulado.
- **La IA elige mal dentro de lo válido** (por ejemplo, una tarjeta gráfica débil para gaming): el validador garantiza validez, no calidad. Las explicaciones y el resumen quedan registrados para revisarlos.
- **Bloqueo por usuario en Postgres:** solo serializa las consultas del mismo usuario, y la transacción es corta, de 3 consultas.
- **El token del gateway sirve para todos los gateways de la cuenta** (limitación de Cloudflare): se guarda solo como secreto del Worker y se puede revocar desde el panel.
- **Encabezado de escenarios del simulado:** solo se honra con `IA_PROVEEDOR=simulado`. Una prueba unitaria comprueba que el adaptador de Anthropic lo ignora.
- **Prompt injection por nombres de producto:** los nombres los carga el ADMIN y van como datos JSON dentro del mensaje. El validador descarta cualquier cosa fuera de los candidatos, así que lo peor posible es una explicación extraña, nunca una configuración inválida.

## Migration Plan

1. Sin migración de base de datos.
2. Dependencias nuevas en `apps/api`: `@anthropic-ai/sdk` y `zod`. Se verifica el tamaño del Worker (límite de 64 MiB sin comprimir).
3. El usuario configura Cloudflare (pasos que se le entregan):
   - crea el gateway `xdtech-ia` con autenticación y "Require provider credentials";
   - guarda la clave de Anthropic en el gateway (claves almacenadas);
   - crea un token con permiso Run;
   - activa el límite de 20 peticiones por hora, deslizante;
   - carga los secretos con `pnpm --filter api exec wrangler secret put IA_GATEWAY_URL` y `... CF_AIG_TOKEN`.

   Los valores se ingresan a mano y nunca se escriben en archivos ni en la conversación.
4. Las variables nuevas en `wrangler.jsonc`; la CI y el e2e usan `IA_PROVEEDOR=simulado`.
5. Rollback: `IA_HABILITADA=false`, revocar el token del gateway o `IA_PROVEEDOR=simulado` dejan el asistente funcionando solo con el respaldo.

## Open Questions

Ninguna. El modelo (Opus 5.5) y el uso de AI Gateway con interruptor los decidió el usuario. El esfuerzo `low` se confirma con la medición en producción.
