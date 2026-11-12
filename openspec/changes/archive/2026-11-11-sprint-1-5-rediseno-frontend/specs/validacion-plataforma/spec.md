# Spec Delta

## ADDED Requirements

### Requirement: Almacenamiento de objetos comprobado
Antes de que el catálogo dependa de él, SHALL comprobarse en producción que el Worker de la API puede escribir, leer y borrar un objeto de 2 MB en el bucket de R2, y medirse la CPU de la subida. El resultado MUST registrarse en `docs/compatibilidad-cloudflare.md` con su decisión. Si no es OK, se usa el plan B registrado allí y no se despliega la subida de imágenes sobre R2.

#### Scenario: R2 operativo
- **WHEN** se ejecuta la prueba de R2 desde el Worker desplegado
- **THEN** el registro de compatibilidad muestra escritura, lectura y borrado OK, la CPU medida y la decisión de usar R2

#### Scenario: R2 no disponible
- **WHEN** R2 no puede activarse en la cuenta o la prueba falla
- **THEN** el registro indica el motivo y el plan B elegido, y las pantallas siguen mostrando el icono de categoría en lugar de imágenes
