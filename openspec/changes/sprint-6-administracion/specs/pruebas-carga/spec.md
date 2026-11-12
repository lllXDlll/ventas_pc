# Spec Delta

## Purpose
Demuestra con escenarios k6 reproducibles que la tienda mantiene la consistencia del stock ante alta demanda, reintentos de pago, expiración de reservas y pérdida del almacén de disponibilidad, y deja los resultados exportados para el informe.

## ADDED Requirements

### Requirement: Concurrencia sobre stock limitado
El escenario de concurrencia SHALL lanzar 300 usuarios virtuales que reservan a la vez 1 unidad de un componente con 5 unidades. La corrida MUST fallar si las reservas exitosas no son exactamente 5 o si aparece una respuesta distinta de 201 o 409.

#### Scenario: Corrida contra producción
- **WHEN** se ejecuta el escenario contra la API desplegada
- **THEN** hay 5 reservas exitosas, 295 rechazos por falta de stock y 0 respuestas inesperadas

### Requirement: Reintentos de pago idempotentes
El escenario de idempotencia SHALL hacer que cada cliente con una reserva activa envíe varias confirmaciones de pago simultáneas con la misma `Idempotency-Key`. La corrida MUST fallar si algún cliente termina con más de una orden o si sus respuestas devuelven órdenes distintas.

#### Scenario: Cinco reintentos simultáneos
- **WHEN** 5 clientes con reserva envían 5 confirmaciones simultáneas cada uno con su clave
- **THEN** existen exactamente 5 órdenes, una por cliente, y todas las respuestas de un cliente traen el mismo id de orden

### Requirement: Consistencia del stock tras la carga
Después de cada escenario, un script de verificación SHALL comprobar en Postgres que:
- las unidades vendidas de cada producto no superan su stock inicial;
- ningún stock físico es negativo;
- la suma de reservas activas no supera el stock físico.

Al terminar, MUST borrar los datos creados por la corrida.

#### Scenario: Verificación posterior
- **WHEN** termina el escenario de idempotencia
- **THEN** la verificación informa unidades vendidas ≤ stock inicial, stock físico ≥ 0, y la base queda sin los datos de la corrida

### Requirement: Liberación por expiración
Con un TTL de reserva corto, el escenario de expiración SHALL comprobar que:
- una primera oleada agota las unidades con reservas que no se pagan;
- tras vencer y correr la expiración, esas unidades vuelven a estar disponibles;
- una segunda oleada de clientes distintos obtiene exactamente esas unidades.

#### Scenario: Segunda oleada
- **WHEN** 5 reservas de la primera oleada vencen sin pago y se ejecuta la expiración
- **THEN** la segunda oleada de 50 clientes obtiene exactamente 5 reservas

### Requirement: Recuperación tras perder el almacén
El escenario de pérdida del almacén SHALL:
1. crear reservas activas;
2. vaciar el almacenamiento del Durable Object `Inventario`;
3. comprobar que el disponible reconstruido y el reconciliado es igual al stock físico menos las reservas activas en Postgres;
4. comprobar que no se puede reservar más de lo que queda.

#### Scenario: Almacén vaciado con reservas activas
- **WHEN** un producto de 5 unidades tiene 2 reservas activas, se vacía el almacén y corre la reconciliación
- **THEN** el disponible es 3, y una oleada de 50 clientes obtiene exactamente 3 reservas

### Requirement: Endpoint de pruebas solo fuera de producción
El vaciado del almacén SHALL hacerse con `POST /pruebas/inventario/vaciar`. Esa ruta MUST existir solo cuando `PRUEBAS_HABILITADAS` vale `"true"`. Sin esa variable, MUST responder 404 como cualquier ruta desconocida. La configuración de producción MUST NOT definir `PRUEBAS_HABILITADAS`.

#### Scenario: Producción
- **WHEN** se llama a `POST /pruebas/inventario/vaciar` en la API desplegada
- **THEN** la API responde 404 y el almacén no cambia

#### Scenario: Local con pruebas habilitadas
- **WHEN** se llama a la ruta en `wrangler dev` con `PRUEBAS_HABILITADAS="true"`
- **THEN** el almacén queda vacío y la respuesta indica cuántos productos y reservas borró

### Requirement: Resultados exportados
Cada escenario SHALL guardar su resumen en un archivo JSON en `tests/k6/resultados/`, con su nombre, la fecha, el entorno, los conteos y las latencias (p50, p90, p95 y máximo). Los resultados de la corrida final MUST quedar anotados en `docs/compatibilidad-cloudflare.md`.

#### Scenario: Resumen guardado
- **WHEN** termina el escenario de concurrencia
- **THEN** existe un JSON con los conteos de reservas exitosas, sin stock e inesperadas, y las latencias
