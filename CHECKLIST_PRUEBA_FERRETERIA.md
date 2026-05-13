# Checklist prueba ferreteria

Usar este checklist con una base de prueba y datos controlados.

## Preparacion

- Confirmar que estan aplicadas las migraciones `001, 003, 004, 005, 006, 007, 008, 009`.
- Confirmar que `.env.local` apunta al proyecto Supabase de prueba.
- Confirmar que `NEXT_PUBLIC_DEFAULT_TENANT_ID` corresponde al tenant de prueba.

## Flujo principal

- Abrir caja desde `/caja`.
- Crear cliente desde `/clientes/nuevo`.
- Buscar producto desde `/productos`.
- Ajustar stock inicial del producto con motivo claro.
- Crear presupuesto desde `/presupuestos/nuevo`.
- Seleccionar el cliente creado.
- Agregar producto con stock disponible.
- Guardar presupuesto.
- Convertir a venta en efectivo por el total.
- Confirmar que la venta se creo correctamente.
- Confirmar que descuenta stock del producto.
- Confirmar en Supabase que existe `inventory_movements` tipo `sale`.
- Confirmar que la venta quedo asociada a la caja abierta.

## Cuenta corriente

- Crear otro presupuesto con cliente.
- Convertir con forma de pago `Cuenta corriente`.
- Pagar menos que el total.
- Confirmar que la deuda aparece en la ficha del cliente.
- Registrar pago desde la ficha del cliente.
- Confirmar que baja el saldo.

## Cierre

- Cerrar caja desde `/caja`.
- Ingresar efectivo contado.
- Confirmar efectivo esperado.
- Confirmar diferencia.
- Revisar historial de caja.

## Resultado esperado

- No quedan presupuestos parciales sin items.
- Las ventas de la prueba aparecen en `/ventas`.
- Los movimientos de stock coinciden con las ventas.
- La cuenta corriente refleja deuda y pago.
- La caja muestra ventas asociadas y diferencia correcta.
