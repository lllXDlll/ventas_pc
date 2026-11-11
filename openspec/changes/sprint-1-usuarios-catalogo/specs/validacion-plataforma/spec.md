# Spec Delta

## MODIFIED Requirements

### Requirement: IP real del cliente
La prueba de IP SHALL confirmar que la API recibe `CF-Connecting-IP` con la IP pública del cliente en una conexión real a `api.xdtech.store`, y documentar qué devuelve la IP del socket. Aunque coincida con `CF-Connecting-IP`, el sistema MUST NOT depender de la IP del socket, porque ese comportamiento no está documentado por Cloudflare.

#### Scenario: Encabezado presente
- **WHEN** un cliente real llama al endpoint temporal de IP
- **THEN** la respuesta muestra la IP pública del cliente tomada de `CF-Connecting-IP`

#### Scenario: IP del socket documentada
- **WHEN** se registra el resultado de la prueba
- **THEN** el registro de compatibilidad indica qué devolvió la IP del socket y que el sistema usa solo `CF-Connecting-IP`
