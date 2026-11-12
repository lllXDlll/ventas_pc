# Design

## Context

Motivación y alcance: ver proposal.md. Los requisitos están en `specs/`. La fuente funcional es `docs/sprint_02_motor_reglas.md`, con tres decisiones del desarrollador tomadas al planificar:
- `velocidadRamMaxMhz` obligatoria en la placa madre;
- `altoDisipadorMm` opcional en el procesador;
- "agregable al carrito" exige que no haya rechazos, aunque falten piezas.

**Estado de partida, al cierre del Sprint 1.5**
- **Esquema:** las tablas `reglas_compatibilidad` (código único del enum `CodigoRegla`, `parametros` JSONB y `activa`), `configuraciones` (usuario, origen MANUAL/IA, estado BORRADOR/VALIDA/INVALIDA y `creada_en`) y `configuracion_items` (cantidad > 0, único por configuración y producto) existen desde la migración inicial y están vacías. No hace falta migración.
- **Atributos técnicos:** `catalogo/atributos.ts` (tabla D8) define los obligatorios por categoría y su validación; `apps/web/src/lib/atributos.ts` es la copia, comprobada por una prueba de la API. Se admiten atributos adicionales sin validar.
- **Disponibilidad:** `DisponibleService.disponibles()` es el puerto de disponibilidad. Hoy devuelve el stock físico; el Sprint 3 lo reemplaza.
- **Frontend:** capas `app → features → components → lib` comprobadas con ESLint. Hay presentacionales reutilizables (`ProductCard`, `SpecsTable`, `StockBadge`) y accesos "Arma tu PC" y "Usar en mi armado" que hoy dicen "Disponible pronto".
- **Restricciones medidas:**
  - CPU: medianas de 12 a 15 ms por ruta con consultas;
  - latencia a Neon: ~150 ms por consulta (región `us-east-2`; ver `docs/compatibilidad-cloudflare.md`).

## Goals / Non-Goals

**Goals:**
- Un motor **puro**, sin infraestructura, que puedan reutilizar el carrito (Sprint 3) y la IA (Sprint 5): recibe componentes y parámetros, y devuelve rechazos.
- Validar en vivo con pocas consultas: como mucho 2 por validación (productos y reglas).
- Mensajes que nombren las piezas y la característica, para que el cliente sepa qué cambiar.

**Non-Goals:**
- Reservar stock, el carrito o el pago.
- Administrar reglas desde el panel.
- Borrar configuraciones.
- Recomendaciones (IA).
- Comprobar que cada placa tenga suficientes ranuras M.2.

## Decisions

### D1. Motor puro con una clase por regla
`compatibilidad/motor/` no importa NestJS, Prisma ni `cloudflare:workers`.

- **Interfaz común:** `interface Regla { codigo: CodigoRegla; validar(c: ConfiguracionEvaluable, p: Parametros): Rechazo[] }`.
- **Configuración evaluable:** se agrupa por categoría, por ejemplo `{ procesador?: Pieza; placa?: Pieza; ram: Pieza[]; … }`, donde cada pieza es `{ id, nombre, atributos, cantidad }`.
- **Rechazo:** `{ codigo, mensaje, productos: string[] }`.
- **Orquestador:** `evaluar(c, reglasActivas)` ejecuta en orden fijo (SOCKET, RAM, POTENCIA, DIMENSIONES, FACTOR_FORMA, ALMACENAMIENTO) las reglas cuya fila está activa y concatena los rechazos.
- **Varios rechazos por regla:** una regla devuelve un arreglo, porque RAM y DIMENSIONES pueden fallar por más de un motivo (spec "Rechazos con código y mensaje claro").
- **Sin datos para comparar:** cada regla devuelve `[]` si falta alguno de los componentes que compara.

*Alternativa:* una función gigante con `if`. Se descarta: el documento pide una clase por regla, y así se prueba cada una por separado.

### D2. Parámetros y valores por defecto
Cada regla declara sus parámetros por defecto:
- POTENCIA: `{ margenPorcentaje: 20, consumoBaseW: 0 }`;
- las demás: `{}`.

Al evaluar, se mezclan los valores por defecto con el JSONB de la fila. Si falta la fila de una regla, la regla se considera activa con sus valores por defecto. Así una base sin semilla no se vuelve permisiva en silencio, y la prueba lo cubre.

**Cálculo de POTENCIA:** `ceil((Σ consumo × cantidad + consumoBaseW) × (1 + margen/100))`, comparado con `potenciaEntregadaW` de la fuente. Ejemplo de la spec: (125 + 263) × 1,2 = 465,6, que redondea a 466.

### D3. Mensajes (HU-13)
`compatibilidad/motor/mensajes.ts` es el catálogo de plantillas por código y motivo. Por ejemplo, para socket: `El procesador «${cpu}» usa socket ${a}, pero la placa «${placa}» es ${b}.`.

Los nombres son los de los productos. Las comparaciones de texto se hacen sin distinguir mayúsculas, pero el mensaje muestra los valores tal como están guardados.

### D4. Servicio y endpoint de validación
`CompatibilidadService.validar(items)` hace dos consultas en la conexión de la petición:
1. productos por `id IN (...)` con categoría, `activo` y atributos, más el disponible a través de `DisponibleService`;
2. `reglas_compatibilidad` (6 filas).

Después llama al motor. Antes de evaluar valida que:
- cada id sea un UUID y exista;
- el producto esté activo y no sea `EQUIPO_ARMADO`;
- haya como mucho 30 ítems;
- cada cantidad sea un entero entre 1 y 8;
- se cumpla la composición de la spec `configuraciones` (uno por categoría única).

Si algo falla, responde 400 con `SOLICITUD_INVALIDA` y un mensaje que nombra el problema.

**`POST /compatibilidad/validar`:**
- es público y no lleva `@RequiereSesion`, porque el armador valida antes de iniciar sesión;
- recibe `{ items: [{ productoId, cantidad }] }`;
- responde `{ compatible, rechazos }`.
- No se agrega un límite de peticiones propio: cuesta lo mismo que `GET /productos` (2 consultas). Se mide su CPU en producción.

*Alternativa:* validar en el navegador con una copia del motor. Se descarta, porque el motor debe vivir en el servidor (es la misma garantía que necesitarán el carrito y la IA) y habría dos copias que mantener.

### D5. Configuraciones
Módulo `configuraciones/` con `@RequiereSesion()` en todo el controlador.

- **`POST` y `PATCH`:** validan con `CompatibilidadService` (composición, productos y reglas). Después, en una transacción interactiva sobre la conexión de la petición:
  - `POST` crea la configuración con origen MANUAL y estado VALIDA o INVALIDA, más sus ítems;
  - `PATCH` borra los ítems, crea los nuevos y actualiza el estado.
  - Ambos devuelven la vista completa.
- **`GET /configuraciones/:id`:** vuelve a validar con el catálogo actual, porque los atributos o el stock pudieron cambiar desde que se guardó. Responde con los rechazos y con `agregable`; no reescribe el estado guardado. Con un id ajeno o inexistente responde 404 `NO_ENCONTRADO`.
- **`GET /configuraciones`:** devuelve las del usuario ordenadas por `creada_en` descendente, con un resumen: id, estado, cantidad de productos, total y fecha. Pagina de 20 en 20.
- **`agregable`:** `rechazos.length === 0 && items.length > 0 && cada ítem activo con disponible ≥ cantidad`. Con un producto sin disponible suficiente, se agrega `faltantes: [{ productoId, disponible, cantidad }]`.
- **`actualizado_en`:** no se agrega. Para el orden basta `creada_en` y no se cambia el esquema.

### D6. Atributos nuevos
**En `catalogo/atributos.ts`:**
- `PLACA_MADRE` gana `velocidadRamMaxMhz: 'entero'`.
- Se agrega `ATRIBUTOS_OPCIONALES = { PROCESADOR: { altoDisipadorMm: 'entero' } }`. `validarAtributos` comprueba el tipo de los opcionales solo si están presentes.
- La copia de la web y su prueba de sincronización incluyen los dos mapas. El formulario del panel muestra los opcionales como "(opcional)".

**Efecto en datos existentes:** las placas de producción sin `velocidadRamMaxMhz` rechazarán un `PATCH` de atributos hasta que se complete. La semilla del catálogo lo completa en las 3 placas de ejemplo:

| Placa | `velocidadRamMaxMhz` |
|---|---|
| MSI B650 | 6400 |
| ASUS B760M-A D4 | 3200 |
| Gigabyte Z790 | 7600 |

La regla RAM, ante una placa sin el atributo (datos antiguos), no evalúa la velocidad y sí el tipo y los módulos. Así no falla con datos viejos.

**La semilla del catálogo** pasa a hacer `ON CONFLICT (id) DO UPDATE SET marca = COALESCE(productos.marca, excluded.marca), atributos = excluded.atributos || productos.atributos`. Con el `||` de JSONB, en las claves repetidas gana lo que ya estaba guardado, así que solo se agregan las que faltan y no se pisan las ediciones del ADMIN.

**Ejemplo de altura de disipador:** se agrega `altoDisipadorMm: 54` a AMD Ryzen 5 7600, que trae disipador de serie. Los procesadores sin disipador incluido no llevan el atributo.

### D7. Semilla de reglas
`semillaReglas(cliente)` en `scripts/semillas.ts`:

```sql
INSERT … (codigo, parametros) VALUES …
ON CONFLICT (codigo) DO NOTHING
```

No pisa los parámetros ajustados. El script `semilla:categorias`, que corre en el job `desplegar`, también carga las reglas. Se renombra el paso a "Semilla de categorías y reglas". `prepararBaseDePruebas` también las carga.

### D8. Armador (frontend)
**`features/armador`:**
- **`api.ts`:** `validar`, y crear, actualizar, leer y listar configuraciones.
- **`hooks/`:**
  - `useValidacion(items)`, una `useQuery` con clave `['validacion', items]`, `placeholderData` anterior y antirrebote de 300 ms;
  - `useConfiguracion(id)`;
  - las mutaciones.
- **`contenedores/armador.tsx`:** el estado de la selección vive en la URL, `?p=<id>:<cant>,…&config=<id>`, con `history.replaceState` como en el catálogo (design D5 del Sprint 1.5). Así se conserva al pedir inicio de sesión: se va a `/ingresar?volver=/armador?...` y el inicio de sesión vuelve a esa URL. `IngresarContenedor` gana el parámetro `volver`, que solo acepta rutas internas que empiecen por `/`.
- **`components/`** (presentación):
  - `PasoCategoria`: lista de productos de la categoría y la elegida, con `ProductCard` en modo seleccionable;
  - `ResumenArmado`: elegidos, total y botones;
  - `ListaRechazos`: código, mensaje y piezas, en una región `aria-live`.
- **Productos de cada paso:** se piden con `GET /productos?categoria=X&porPagina=100`, que ya filtra los que tienen disponible.

**Regla de capas:** `ProductCard` vive en `features/catalogo/components`, y `features/armador` no puede importarlo de otra funcionalidad. Se mueven `ProductCard`, `ImagenProducto`, `StockBadge` y `SpecsTable` a `components/producto/`. Sus importaciones son todas de `lib/` y `components/ui`, y el catálogo pasa a importarlos de ahí. Lo compartido entre funcionalidades va en `components/` (spec `arquitectura-frontend`).

**Shell y detalle:**
- "Arma tu PC" pasa a ser un enlace a `/armador`.
- "Usar en mi armado" pasa a ser un enlace a `/armador?p=<id>:1`.
- "Armador IA", "Ofertas" y el carrito siguen como "Disponible pronto".
- En el resumen, "Agregar al carrito" muestra "Disponible pronto" si es agregable, y se muestra deshabilitado con el motivo si no lo es.

### D9. Pruebas
- **Unitarias del motor:** por regla, al menos un caso válido, uno inválido y uno sin datos. Además:
  - RAM, con los tres motivos y la suma de módulos;
  - POTENCIA, con margen por defecto y configurado;
  - DIMENSIONES, con y sin alto de disipador;
  - el orquestador, con reglas inactivas y una fila ausente.
- **Integración:**
  - `POST /compatibilidad/validar`: compatible, rechazo de socket, 400 por un equipo armado, uno inexistente y composición inválida;
  - configuraciones: 401, 201 con estado, `PATCH` que corrige, 404 ajeno, lista propia y `agregable` falso con un producto agotado;
  - semillas: reglas idempotentes que conservan el margen, y atributos que completan sin pisar.
- **`rutas-admin.e2e`** sigue verificando que nada nuevo cuelga de `/admin` sin rol.
- **Playwright:**
  - armado con rechazo de socket y su corrección;
  - guardar pidiendo inicio de sesión y retomar la configuración;
  - "Usar en mi armado" desde el detalle;
  - accesibilidad con axe y ancho de 360 px en `/armador`.
  - La prueba `@humo` del armador es de solo lectura: valida sin guardar.

## Risks / Trade-offs

- **[Validación en vivo con mucha frecuencia]** → Antirrebote de 300 ms y caché de TanStack por la clave de ítems. Cada validación son 2 consultas (~0,3 s de latencia hasta Neon), aceptable para la interacción. Se mide la CPU con `wrangler tail`.
- **[Datos antiguos sin los atributos nuevos]** → Se toleran (D6) y la semilla los completa. El panel exige el atributo al editar una placa.
- **[El motor y la UI divergen en reglas de composición]** → La composición se valida en el servidor (D4). La UI solo la refleja: permite uno por categoría única.
- **[Mover componentes rompe importaciones]** → Se hace en una tarea aislada, con lint, typecheck y las pruebas e2e antes de seguir.

## Migration Plan

1. Desplegar la API: atributos, motor, endpoints y semilla de reglas en el paso de CI. No hay migración de esquema.
2. Correr `semilla:catalogo` contra Neon (la hace el desarrollador) para completar `velocidadRamMaxMhz` y `altoDisipadorMm`.
3. Desplegar la web con el armador.

**Vuelta atrás:** revertir el commit. Las filas de `reglas_compatibilidad` y de configuraciones pueden quedar, porque no las usa el código anterior.

## Open Questions

- Ninguna que cambie lo que se construye. La administración de reglas desde el panel queda para el Sprint 6.
