# Spec Delta

## ADDED Requirements

### Requirement: Marca e imagen de producto
La tabla de productos SHALL tener una columna de marca y una columna con la clave de la imagen en el almacenamiento de objetos, vacía cuando el producto no tiene imagen. La imagen MUST NOT guardarse en la base de datos. La migración MUST aplicarse sobre una base con productos existentes sin perderlos.

#### Scenario: Migración con datos
- **WHEN** se aplica la migración en una base con el catálogo del Sprint 1
- **THEN** los productos existentes se conservan, con la marca y la imagen vacías hasta que la semilla o un ADMIN las completen

#### Scenario: Estructura de productos
- **WHEN** se inspecciona la tabla de productos
- **THEN** tiene las columnas de marca y de clave de imagen, y ninguna columna con el contenido binario de la imagen
