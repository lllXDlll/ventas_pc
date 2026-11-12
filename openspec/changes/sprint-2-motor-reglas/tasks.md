# Tasks

## 1. Atributos técnicos y semillas

- [x] 1.1 Agregar `velocidadRamMaxMhz` obligatorio a PLACA_MADRE y `ATRIBUTOS_OPCIONALES` con `altoDisipadorMm` en PROCESADOR, validados por tipo solo si están presentes (design D6), en `catalogo/atributos.ts` y en la copia `apps/web/src/lib/atributos.ts`. Se verifica con:
  - pruebas unitarias de los escenarios de "Atributos técnicos validados por categoría";
  - la prueba de sincronización con la web, ampliada a los opcionales.
- [x] 1.2 Semilla del catálogo:
  - `velocidadRamMaxMhz` en las 3 placas;
  - `altoDisipadorMm` en el Ryzen 5 7600;
  - `ON CONFLICT` que completa los atributos que faltan sin pisar los editados (`excluded.atributos || productos.atributos`).

  Se verifica con `semillas.int` ampliada: placas sin el atributo quedan con él, y un atributo editado conserva su valor.
- [x] 1.3 `semillaReglas`: seis reglas con sus parámetros por defecto (`POTENCIA: { margenPorcentaje: 20, consumoBaseW: 0 }`) y `ON CONFLICT DO NOTHING`. Se incluye en `semilla:categorias` y en `prepararBaseDePruebas`, y se renombra el paso de la CI (design D7). Se verifica con una prueba de integración: dos ejecuciones dan seis reglas y conservan un margen cambiado a 25 %.

## 2. Motor de compatibilidad (puro)

- [x] 2.1 Tipos (`Pieza`, `ConfiguracionEvaluable`, `Rechazo`, `Regla`), agrupación por categoría y catálogo de mensajes (design D1 y D3). Se verifica con `pnpm --filter api typecheck` y con pruebas unitarias de la agrupación.
- [x] 2.2 Reglas SOCKET y FACTOR_FORMA. Se verifica con pruebas unitarias: caso válido, inválido, sin datos y sin distinguir mayúsculas. El mensaje debe nombrar las piezas y los valores.
- [x] 2.3 Regla RAM (tipo, velocidad y módulos sumados; tolera una placa sin `velocidadRamMaxMhz`). Se verifica con pruebas unitarias de los tres motivos, de varios rechazos a la vez y de la placa sin el atributo.
- [x] 2.4 Regla POTENCIA con margen y consumo base desde parámetros, y redondeo hacia arriba (design D2). Se verifica con pruebas unitarias del ejemplo de la spec (466 W frente a 400 W), del margen configurado al 30 % y del caso dentro del margen.
- [x] 2.5 Reglas DIMENSIONES (GPU y disipador opcional) y ALMACENAMIENTO (una por unidad). Se verifica con pruebas unitarias de cada escenario de la spec.
- [x] 2.6 Orquestador: orden fijo, reglas inactivas omitidas y regla sin fila activa con sus valores por defecto. Se verifica con pruebas unitarias.

## 3. API de compatibilidad y configuraciones

- [x] 3.1 `CompatibilidadService` (2 consultas y validación de entrada y composición, design D4) y `POST /compatibilidad/validar` público. Se verifica con pruebas de integración:
  - compatible;
  - rechazo `SOCKET` con su mensaje;
  - 400 por un equipo armado, un id inexistente, un producto inactivo, dos procesadores y una cantidad fuera de rango.
- [x] 3.2 `POST`, `PATCH`, `GET /:id` y `GET` de `/configuraciones` con sesión, dueño, estado guardado, rechazos recalculados, `agregable` y `faltantes` (design D5). Se verifica con pruebas de integración de cada escenario de la spec `configuraciones`, incluida la lista paginada y el producto agotado.
- [x] 3.3 Medir con `wrangler tail` en producción la CPU de `POST /compatibilidad/validar` y de `GET /configuraciones/:id`, y registrarla en `docs/compatibilidad-cloudflare.md`. Se verifica con la tabla de medianas.

## 4. Frontend: armador

- [x] 4.1 Mover `ProductCard`, `ImagenProducto`, `StockBadge` y `SpecsTable` a `components/producto/` y actualizar las importaciones (design D8), en un commit aislado. Se verifica con `pnpm lint`, `typecheck` y Playwright en verde.
- [x] 4.2 `features/armador`: `api.ts` y los hooks `useValidacion` (antirrebote de 300 ms), `useConfiguracion` y las mutaciones. Se verifica con `typecheck` y con el lint de capas.
- [x] 4.3 Pantalla `/armador`:
  - pasos por categoría con productos con stock;
  - `ProductCard` seleccionable;
  - selección en la URL;
  - resumen con total;
  - `ListaRechazos` con `aria-live`;
  - estados de carga, vacío y error.

  Se verifica con una prueba de Playwright: elegir un procesador LGA1700 y una placa AM5 muestra el rechazo de socket, y cambiar a una placa LGA1700 lo quita.
- [x] 4.4 Guardar y retomar:
  - sin sesión, va a `/ingresar?volver=…`, con `volver` limitado a rutas internas;
  - con sesión, `POST` o `PATCH`, y la URL pasa a incluir `config=`;
  - "Agregar al carrito" se muestra según `agregable`.

  Se verifica con una prueba de Playwright: guardar sin sesión, iniciar sesión, volver con la selección intacta, guardar y recargar.
- [x] 4.5 "Arma tu PC" como enlace a `/armador` (shell y menú móvil) y "Usar en mi armado" como enlace a `/armador?p=<id>:1`. Ajustar la prueba de "accesos de sprints futuros" para que ya no incluya el armado. Se verifica con una prueba de Playwright desde el detalle y con la prueba ajustada en verde.

## 5. Pruebas, documentación y cierre

- [x] 5.1 Agregar `/armador` a las pruebas de axe y a la de 360 px. Además, una prueba `@humo` del armador que valida sin guardar. Se verifica con `pnpm test:e2e` en verde, en local y en la CI.
- [x] 5.2 Actualizar la documentación:
  - en `docs/00_parte_tecnica.md`: la tabla de atributos con `velocidadRamMaxMhz` y el opcional `altoDisipadorMm`, y los parámetros de POTENCIA;
  - en `docs/sprint_02_motor_reglas.md`: una nota con las tres decisiones y el endpoint `GET /configuraciones`.

  Se verifica con una lectura sin contradicciones con design.md.
- [ ] 5.3 Ejecutar `semilla:catalogo` contra Neon para completar los atributos nuevos (lo hace el desarrollador). Se verifica con `GET https://api.xdtech.store/productos/<id de la placa MSI B650>`, que muestra `velocidadRamMaxMhz`.
- [ ] 5.4 CI completa en verde y `@humo` contra producción. Se verifica con la ejecución de la CI del último commit y con `E2E_URL=https://xdtech.store pnpm test:e2e --grep @humo`.

## Workflow follow-up

- Archivar el cambio con `/opsx:archive` cuando la definición de hecho esté verificada.
- Proponer el Sprint 3 (`docs/sprint_03_concurrencia_carrito.md`), reutilizando `CompatibilidadService` para impedir que una configuración incompatible llegue al carrito.
