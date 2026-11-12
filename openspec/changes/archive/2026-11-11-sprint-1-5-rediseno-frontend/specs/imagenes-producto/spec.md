# Spec Delta

## Purpose
Permite que cada producto tenga una imagen opcional subida por un administrador, guardada fuera de la base de datos y entregada a los clientes con caché, sin que su ausencia rompa ninguna pantalla.

## ADDED Requirements

### Requirement: Subida de imagen de producto
Un ADMIN SHALL poder subir una imagen para un producto con `PUT /admin/productos/:id/imagen`. Se aceptan JPEG, PNG y WebP de hasta 2 MB, y el tipo MUST comprobarse por el contenido del archivo y no solo por el encabezado. Si el producto ya tenía imagen, la nueva la reemplaza y la anterior MUST borrarse del almacenamiento.

#### Scenario: Imagen válida
- **WHEN** un ADMIN sube un PNG de 300 KB para un producto
- **THEN** la API responde 200 con la URL de la imagen y el detalle del producto la incluye

#### Scenario: Reemplazo
- **WHEN** un ADMIN sube una segunda imagen para el mismo producto
- **THEN** el producto apunta a la nueva y la anterior ya no existe en el almacenamiento

#### Scenario: Archivo demasiado grande
- **WHEN** se sube una imagen de 3 MB
- **THEN** la API responde 413 y el producto conserva su imagen anterior

#### Scenario: Tipo no admitido
- **WHEN** se sube un archivo que no es JPEG, PNG ni WebP, aunque declare `Content-Type: image/png`
- **THEN** la API responde 415 y no guarda nada

#### Scenario: Sin rol de administrador
- **WHEN** un CLIENTE o un visitante sin sesión intenta subir una imagen
- **THEN** la API responde 403 o 401 y no guarda nada

### Requirement: Borrado de imagen de producto
Un ADMIN SHALL poder quitar la imagen de un producto con `DELETE /admin/productos/:id/imagen`. El archivo MUST borrarse del almacenamiento y el producto MUST quedar sin imagen.

#### Scenario: Quitar imagen
- **WHEN** un ADMIN borra la imagen de un producto que la tiene
- **THEN** la API responde 204 y el detalle del producto ya no trae URL de imagen

### Requirement: Entrega de la imagen
La imagen de un producto activo SHALL poder pedirse sin sesión en la URL que devuelve el catálogo, con su tipo de contenido y una caché de larga duración. Cada imagen nueva MUST tener una URL distinta, para que la caché nunca muestre una imagen reemplazada.

#### Scenario: Imagen servida
- **WHEN** un visitante pide la URL de imagen de un producto
- **THEN** recibe 200 con el tipo de contenido de la imagen y un encabezado de caché de larga duración

#### Scenario: Producto sin imagen
- **WHEN** un producto no tiene imagen
- **THEN** el catálogo no trae URL de imagen y las pantallas muestran el icono de su categoría en el mismo recuadro

### Requirement: Imagen independiente del resto del producto
Subir, reemplazar o borrar la imagen MUST NOT cambiar otros datos del producto, ni su stock ni la versión del stock.

#### Scenario: Stock intacto
- **WHEN** un ADMIN sube una imagen a un producto con stock 5 y versión 2
- **THEN** el stock sigue en 5 con versión 2
