# Sprint 6: Administración y endurecimiento (semana 7)

> Contexto previo: `00_parte_tecnica.md`. Implementa solo lo de este documento.

**Objetivo:** reglas gestionables, reportes, seguridad y pruebas de carga completas.
**Depende de:** Sprint 5 (tabla `uso_asistente` poblada), Sprint 4 (órdenes), Sprint 3 (reservas, k6 local) y Sprint 2 (reglas en base de datos).

## HU-15 Gestión de reglas de compatibilidad
**Como** administrador, **quiero** gestionar los parámetros de las reglas, **para** adaptarlas sin tocar el código.

**Criterios de aceptación**
- Puedo activar o desactivar una regla y editar sus parámetros.
- Los cambios aplican a las siguientes validaciones.
- Parámetros inválidos se rechazan con mensaje.

**Tareas:** `GET/PATCH /admin/reglas`, validación de parámetros por regla, pantalla en el panel.

## HU-33 Reporte de ventas
**Como** administrador, **quiero** consultar reportes de ventas, **para** conocer el desempeño de la tienda.

**Criterios de aceptación**
- Filtro por rango de fechas.
- Muestra total vendido, número de órdenes y productos más vendidos.

**Tareas:** `GET /admin/reportes/ventas`, consultas agregadas, pantalla con tabla y gráfico.

## HU-34 Reporte de uso del asistente
**Como** administrador, **quiero** consultar el uso del asistente de IA, **para** evaluar su utilidad y su costo.

**Criterios de aceptación**
- Muestra número de consultas, porcentaje con respaldo, latencia promedio y distribución por uso previsto.
- Filtro por rango de fechas.

**Tareas:** `GET /admin/reportes/asistente`, consultas sobre `uso_asistente`, pantalla.

## HU-37b Pruebas de carga completas
**Como** desarrollador, **quiero** el escenario completo de k6, **para** demostrar la consistencia ante alta demanda.

**Criterios de aceptación**
- 300 usuarios virtuales sobre un componente de 5 unidades: reservas exitosas == 5.
- Las órdenes confirmadas nunca superan el stock; el stock físico nunca es negativo.
- Reintentos con la misma `Idempotency-Key` no duplican compras.
- Con TTL corto, las reservas no pagadas se liberan y una segunda oleada adquiere esas unidades.
- Tras reiniciar Redis, la reconciliación restaura el disponible correcto.

**Tareas:** extender `tests/k6/` con escenarios de idempotencia, expiración y reinicio de Redis; exportar resultados para el informe.

## Endurecimiento de seguridad (transversal)
- Hash robusto, sesiones con vencimiento y guardas de rol en cada endpoint administrativo.
- Validación de entradas en todos los DTOs.
- Límite de peticiones en registro (por IP), inicio de sesión (por correo y por IP) y asistente (por usuario, contado desde `uso_asistente`). Los contadores de registro e inicio de sesión van en el almacén elegido en el Sprint 0, nunca en memoria del Worker, y la IP se lee de `CF-Connecting-IP`. Verificar que la IP detectada sea la real del cliente.
- Verificar que la limpieza de sesiones vencidas funciona y que la tabla `sesiones` no crece sin límite.
- Revisar la cookie de sesión: `httpOnly`, `Secure`, `SameSite=Lax`, y CORS con credenciales restringido al origen del frontend.
- Revisión de que ningún secreto esté en el repositorio.

## Definición de hecho del sprint
Panel administrativo completo, reportes funcionando, resultados de k6 documentados, revisión de seguridad hecha.
