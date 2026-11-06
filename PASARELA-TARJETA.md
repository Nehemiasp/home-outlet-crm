# Pago con tarjeta — proveedores en Guatemala y cómo se conecta

Documento para decidir con el cliente qué proveedor usar. **Los porcentajes y los tiempos de esta página salen de blogs y comparativas de terceros, no de los proveedores**: hay que confirmarlos directamente con cada uno antes de decidir.

## 1. Qué ya está hecho en el sistema

El sistema ya cobra con tarjeta usando una **pasarela simulada** (no mueve dinero), con todo el flujo real:

1. Al **crear el pedido** se elige la forma de pago (**Tarjeta**). Al enviarlo, el sistema pide el cobro por el total y el resumen que recibe el cliente ya trae el enlace. Si el cliente cambia de idea, en el detalle del pedido **Cambiar forma de pago** pasa a tarjeta (cobro por el saldo) o la quita (el cobro abierto se anula). El botón **Reenviar enlace de pago** sirve para mandarlo otra vez. Si la pasarela no responde al enviar, no se aparta nada.
2. El cliente paga en la página del proveedor.
3. El proveedor avisa con un **webhook firmado** a `POST /api/pagos/webhook`. Con firma válida, el sistema registra un pago de tarjeta, lo **confirma solo**, el pedido pasa a «Pagado» y se descuenta la existencia. Al cliente le llega «Confirmamos su pago».

Reglas de seguridad ya incluidas:
- Sin firma válida no se procesa nada (y 30 firmas malas desde una IP la bloquean).
- Es **idempotente**: el proveedor repite avisos y nunca se registra dos veces el mismo pago.
- **Nunca confía en el monto**: si lo cobrado no coincide con lo pedido, o el pedido ya no esperaba pago (cancelado, vencido), el pago queda «en revisión» con un aviso en la conversación para que una persona lo resuelva.
- Un solo enlace abierto por pedido (pedirlo otra vez reutiliza el mismo; otro monto anula el anterior).
- Si se cambia la forma de pago y el cliente igualmente paga el enlace anterior (con un proveedor real el enlace puede seguir vivo), el pago **no se pierde**: queda en revisión con aviso en la conversación.
- Un pago rechazado por el banco no registra nada y se puede mandar otro enlace.

Para probarlo: `PASARELA=simulada` en el servidor de desarrollo, encender «Tarjeta» en Ajustes → Pagos y envíos, y usar el botón. La página de pago de prueba es `/pagar/<id>` y **no existe en producción**.

## 2. Proveedores que se evaluaron

| | **Recurrente** | **Pagadito** | **Bancarios (VisaNet / NeoLink, bancos)** |
|---|---|---|---|
| Qué es | Plataforma de pagos en línea guatemalteca: API, enlaces de pago, cuotas, cobros recurrentes | Pasarela regional | Adquirencia de los bancos |
| Cómo se cobra | Hospedado: se crea un checkout y se redirige al cliente | Hospedado | Página de pago del adquirente |
| Comisión de referencia | ~4.5 % + Q1.20 a Q2 por transacción | ~4.5 % + US$0.50 (otra fuente: 5 %) | No hay cifras públicas; negociable por volumen |
| Alta | Rápida (2 a 5 días, según una fuente) | Sin costo de afiliación | Más lenta (5 a 15 días, según una fuente) y con contrato de comercio |
| Requisitos habituales | Patente de comercio, RTU y cuenta bancaria | Similares | Contrato de afiliación con el banco |
| Calza con el sistema | **Sí**: API + webhooks firmados | Sí, a revisar su API | Sí, a revisar: suele ser más trabajo de integración |

No encontré información fiable de **Tilopay** ni de la API de **NeoNet**; si el cliente ya tiene contrato con alguno, hay que pedir su documentación.

### Recomendación
Para una tienda como Home Outlet que quiere empezar rápido, **Recurrente** es la opción que mejor calza: alta rápida, API y webhooks firmados, quetzales. Una vez haya volumen, conviene **cotizar con el banco** del negocio, porque la comisión de un adquirente bancario suele ser menor, aunque tarda más en activarse. La arquitectura permite cambiar de proveedor sin tocar pedidos ni pagos.

### Qué hay que preguntarle al cliente
- ¿Quieren tarjeta en esta etapa o más adelante?
- ¿Ya tienen cuenta o contrato con algún proveedor o banco?
- ¿Quién asume la comisión (el negocio, o se suma al precio)? El sistema hoy cobra exactamente el saldo del pedido.
- ¿Aceptan cuotas?
- ¿Quién devuelve el dinero si hace falta un reembolso? (Hoy se hace en el panel del proveedor; el sistema no lo hace.)

## 3. Cómo se conecta un proveedor real

La pasarela es una interfaz pequeña (`lib/pagos-tarjeta/tipos.ts`). Conectar un proveedor es **un archivo nuevo**, sin tocar pedidos ni pagos:

1. Escribir `lib/pagos-tarjeta/<proveedor>.ts` que cumpla `Pasarela`:
   - `crearCobro({ referencia, monto, descripcion })` → pide el cobro al proveedor (monto en centavos, moneda GTQ) y devuelve `{ externoId, url }`.
   - `verificarWebhook(cuerpo, cabeceras)` → valida la firma con el cuerpo **crudo**.
   - `interpretarWebhook(cuerpo)` → devuelve `{ externoId, estado: "pagado" | "fallido", monto, referencia? }`, o `null` para eventos que no son de un cobro.
2. Agregarlo en `lib/pagos-tarjeta/index.ts` (`if (p === "recurrente") return pasarelaRecurrente;`).
3. Variables de entorno: `PASARELA=<proveedor>` y las claves del proveedor (llaves de API y secreto del webhook).
4. En el panel del proveedor, apuntar el webhook a `https://<dirección>/api/pagos/webhook`.
5. Probar en el modo de pruebas del proveedor, y después encender «Tarjeta» en Ajustes → Pagos y envíos.
6. Escribir sus pruebas igual que las de la pasarela simulada (`tests/tarjeta.test.ts` ya cubre el flujo completo).

### Notas de Recurrente (de documentación no oficial; confirmar en la oficial)
- Se crea un *checkout* con las líneas en centavos y moneda GTQ, y se redirige al cliente a la dirección que devuelve.
- Los webhooks los entrega con **Svix**: tres cabeceras (`svix-id`, `svix-timestamp`, `svix-signature`) y un secreto que empieza por `whsec_`. La función `verificarWebhook` recibe todas las cabeceras, así que la firma se valida ahí.
- La misma dirección sirve para pruebas y producción; el prefijo de la llave define el modo.
- **Los nombres exactos de los eventos** (`checkout.succeeded`, `payment_intent.succeeded`…) se contradicen entre las fuentes que revisé: hay que confirmarlos en su documentación oficial antes de escribir `interpretarWebhook`.

## 4. Lo que todavía no hace

- **Reembolsos** desde el sistema.
- **Cuotas** ni cobros recurrentes.
- **Vencimiento del enlace**: depende del proveedor; si el cliente paga un enlace viejo de un pedido ya vencido, el pago queda «en revisión» para que una persona decida.
- **Conciliación**: no compara contra el estado de cuenta del proveedor.
- Probarlo con un proveedor real (falta la cuenta).

## Fuentes consultadas

- [Recurrente, la nueva plataforma de pagos en línea en Guatemala (guatemala.com)](https://www.guatemala.com/noticias/sociedad/recurrente-nueva-plataforma-pagos-en-linea-guatemala)
- [Pasarelas de Pago en Guatemala, Guía eCommerce 2026 (VisionWeb)](https://blog.visionweb.com.gt/pasarelas-de-pago-en-guatemala/)
- [Pasarelas de pago en Guatemala 2026 (masdigital)](https://www.masdigital.net/comparativas/pasarelas-de-pago-guatemala)
- [Recurrente Guatemala 2025 (Arrobo & Co)](https://arrobo.ec/recurrente-pasarela-pagos-guatemala-2025/)
- [SDK no oficial de Recurrente: primeros pasos](https://rodmarzavala.github.io/recurrente-sdk/en/getting-started.html) y [webhooks](https://rodmarzavala.github.io/recurrente-sdk/webhooks)
