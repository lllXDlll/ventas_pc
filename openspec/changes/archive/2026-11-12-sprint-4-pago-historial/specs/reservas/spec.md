# Spec Delta

## MODIFIED Requirements

### Requirement: Pantalla de reserva
Desde `/carrito`, "Iniciar compra" SHALL reservar y mostrar la cuenta regresiva hasta el vencimiento, el botón "Pagar", que lleva a la pantalla de pago `/pago` (Sprint 4), y el botón "Cancelar reserva". Si falta stock, MUST mostrar qué producto faltó. Al vencer, MUST indicar que la reserva expiró y permitir reservar de nuevo.

#### Scenario: Cuenta regresiva
- **WHEN** un cliente inicia la compra
- **THEN** ve el tiempo restante de su reserva y puede cancelarla

#### Scenario: Reserva vencida en pantalla
- **WHEN** la cuenta regresiva llega a cero
- **THEN** la pantalla indica que la reserva expiró y ofrece reservar de nuevo

#### Scenario: Ir a pagar
- **WHEN** un cliente con una reserva activa pulsa "Pagar"
- **THEN** llega a `/pago` con la misma cuenta regresiva
