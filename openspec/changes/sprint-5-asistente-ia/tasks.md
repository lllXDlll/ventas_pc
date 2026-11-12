## 1. Base del asistente (funciones puras)

- [x] 1.1 Dependencias `@anthropic-ai/sdk` y `zod` en `apps/api`; comprobar que el Worker empaqueta y su tamaño
- [x] 1.2 `perfiles.ts` (reparto por uso, design D2) y `preseleccion.ts` (hasta 5 candidatos por categoría con el más barato incluido, alias `C1…`, solo disponible > 0)
- [x] 1.3 `esquema.ts`: esquema zod de la respuesta y `validarRecomendacion` (alias, categorías completas, disponible, presupuesto y rechazos del motor puro con las reglas vigentes)
- [x] 1.4 `armador-deterministico.ts` (búsqueda con poda y límite de nodos, `armar` y `minimo`) y `plantillas.ts`
- [x] 1.5 Pruebas unitarias de 1.2 a 1.4: cada motivo del validador, preselección, los 5 perfiles válidos y dentro del presupuesto, gaming con más peso en la tarjeta gráfica que oficina, mínimo y tiempo de CPU acotado

## 2. Proveedores de IA

- [x] 2.1 Interfaz `ProveedorIA` y token de Nest; selección por `IA_PROVEEDOR`; variables `IA_HABILITADA`, `IA_PROVEEDOR`, `IA_MODELO`, `IA_TIMEOUT_MS`, `ASISTENTE_LIMITE_24H` en `wrangler.jsonc`, `.dev.vars.example` y el tipo `Env`; `IA_GATEWAY_URL` y `CF_AIG_TOKEN` solo como secretos
- [x] 2.2 `ProveedorAnthropic` con el SDK por AI Gateway (`baseURL` del gateway, `cf-aig-authorization`, sin `x-api-key`, claves almacenadas): `messages.parse` con `zodOutputFormat`, `claude-opus-5-5`, esfuerzo `low`, `max_tokens` 4000, `maxRetries: 0`, timeout por intento, reintento con los motivos, `refusal` y errores tipados mapeados a motivos de respaldo (401 del gateway, 429 de su límite, 2044); `fallbacks` del servidor si el SDK lo admite en `parse`; ningún secreto en logs
- [x] 2.3 `ProveedorSimulado` con escenarios por `x-ia-simulado` (válida, inválida, inválida-luego-válida, json-inválido, caída, lenta), honrado solo con `IA_PROVEEDOR=simulado`
- [x] 2.4 Pruebas unitarias del adaptador de Anthropic con `fetch` simulado (URL y encabezados del gateway, cuerpo enviado, mapeo de errores, timeout, sin configuración) y de que ignora el encabezado de escenarios

## 3. Orquestador, límite y endpoints

- [x] 3.1 `ConfiguracionesService.crearDesdeAsistente` (origen `IA`, presupuesto y uso) y `presupuesto` y `uso` en `VistaConfiguracion`
- [x] 3.2 `LimiteAsistenteService`: reserva con bloqueo por usuario en `conTransaccion` (429 `LIMITE_ASISTENTE` con `disponibleDesde`) y consulta de consultas usadas
- [x] 3.3 `AsistenteService.recomendar` (design D6) con el interruptor `IA_HABILITADA` (design D10): mínimo (422 sin consumir cupo), reserva, preselección, proveedor con un reintento, respaldo, guardado, registro con latencia y respaldo
- [x] 3.4 `AsistenteController`: `POST /asistente/recomendar` (DTO con presupuesto 1–100000 y uso) y `GET /asistente/limite`, con sesión; registrar el módulo
- [x] 3.5 Pruebas de integración con el simulado: válida (201, `IA`, `VALIDA`, agregable), inválida y luego válida (2 intentos, sin respaldo), inválida y JSON inválido (respaldo), caída y lenta (respaldo, latencia acotada), 422 sin consumir cupo, undécima consulta 429, dos simultáneas con 9 previas, `GET /asistente/limite`, registro de uso, `PATCH` que conserva el origen, IA apagada (respaldo sin llamadas, motivo `IA_DESACTIVADA`) y 401 sin sesión

## 4. Frontend

- [x] 4.1 `features/asistente` (api, hooks, componentes de presentación y contenedor) y ruta `/asistente`: formulario de presupuesto y uso, estado de espera, recomendación con explicaciones, total, respaldo, consultas restantes, 422 con el mínimo y 429 con la hora; "Agregar al carrito" y "Editar en el armador"
- [x] 4.2 Accesos: "Armador IA" de la cabecera y "Arma tu PC con IA" del inicio llevan a `/asistente`; `asistente` en `FUNCIONALIDADES` de ESLint
- [x] 4.3 Armador: insignia "Recomendada por IA" con presupuesto y uso para configuraciones de origen `IA`
- [x] 4.4 Pruebas unitarias del frontend para la lógica de formato que se agregue (por ejemplo, la hora de cupo disponible)

## 5. E2e, documentación y despliegue

- [x] 5.1 E2e con `IA_PROVEEDOR=simulado` (en `playwright.config.ts`): recomendar, agregar al carrito, editar en el armador con la insignia, respaldo visible, límite alcanzado; actualizar el e2e de accesos futuros (solo queda "Ofertas"); axe y 360 px en `/asistente`; `@humo` que abre `/asistente` sin enviar
- [x] 5.2 Documentación: `docs/00_parte_tecnica.md` (flujo implementado, modelo, esfuerzo, variables, secreto, costos y límites) y `.dev.vars.example`
- [ ] 5.3 CI en verde y despliegue; guía para el usuario: crear el gateway `xdtech-ia` con autenticación, guardar la clave de Anthropic en el gateway, crear el token, activar el límite de 20 por hora y cargar `IA_GATEWAY_URL` y `CF_AIG_TOKEN` con `wrangler secret put` (sin escribir secretos en archivos)
- [ ] 5.4 Consulta real de verificación en producción por el gateway (y una con `IA_HABILITADA=false` o el token revocado que cae al respaldo): latencia, tokens, costo, registro en el panel del gateway y si se usó el respaldo, anotados en `docs/compatibilidad-cloudflare.md`; `@humo` contra producción en verde
