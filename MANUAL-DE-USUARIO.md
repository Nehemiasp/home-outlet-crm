# Home Outlet CRM — Manual de usuario

Para el equipo de Home Outlet: agentes, jefe de tienda y administradores. Cada persona ve solo lo que su rol permite; en cada sección se indica quién puede hacer qué.

---

## 1. Qué es y cómo está organizado

Es un sistema donde llegan en un solo lugar los mensajes de los clientes (WhatsApp, Facebook, Instagram), con sus datos, el catálogo, los pedidos y los pagos. Un **asistente con inteligencia artificial** atiende primero y pasa la conversación a una persona cuando hace falta.

El menú de la izquierda (en el teléfono, la barra de abajo) tiene:

| Opción | Para qué |
|---|---|
| **Bandeja** | Conversaciones con los clientes |
| **Pedidos** | Pedidos, pagos y entregas |
| **Contactos** | Clientes, etiquetas y notas |
| **Catálogo** | Productos y existencias |
| **Reportes** | Cifras de atención y ventas (jefe de tienda y administrador) |
| **Ajustes** | Configuración (solo administrador) |

Los números naranja junto a Bandeja y Pedidos son lo que está esperando: mensajes sin leer y pagos por verificar.

## 2. Entrar, salir y la contraseña

1. Abra la dirección del sistema y escriba su **correo** y su **contraseña**.
2. La contraseña se la entrega el administrador. **Las contraseñas solo las cambia o restablece un administrador**: nadie puede cambiar la suya desde el sistema. Guárdela en un lugar seguro y no la comparta.
3. Para salir, use **Salir** (abajo del menú). Es importante hacerlo en una computadora compartida.

**Si la olvidó, o quiere otra:** pídale a un administrador que se la restablezca (**Ajustes → Usuarios → Restablecer contraseña**): le dará una nueva, que se muestra **una sola vez**.

**Si se equivoca varias veces:** después de 5 intentos fallidos el sistema espera 15 minutos antes de dejarle intentar otra vez.

## 3. Roles: qué puede hacer cada quien

| | **Agente** | **Jefe de tienda** | **Administrador** |
|---|---|---|---|
| Ve las conversaciones, contactos y pedidos | Solo los **asignados a usted** (lo normal) | **Todos** | **Todos** |
| Atiende y responde | Sí | Sí | Sí |
| Se asigna una conversación | Solo si está libre o ya es suya | A cualquiera, y reasigna | A cualquiera, y reasigna |
| Cierra conversaciones | Solo las suyas | Cualquiera | Cualquiera |
| Crea y envía pedidos | Sí | Sí | Sí |
| Da descuentos | Hasta el límite que fija el administrador | **Sin tope** | **Sin tope** |
| Aparta «sobre pedido» (sin existencia suficiente) | No | Sí | Sí |
| Verifica pagos | Solo si el administrador se lo activó | Sí | Sí |
| Cancela pedidos | Solo los que creó y sin pago verificado | Cualquiera | Cualquiera |
| Cambia el estado de los agentes y reparte sus conversaciones | No | Sí | Sí |
| Crea y edita productos, existencias e importa CSV | No (solo ve) | Sí | Sí |
| Une contactos duplicados | No | Sí | Sí |
| Ve **Reportes** | No | Sí | Sí |
| **Ajustes**: usuarios, canales, asistente, cuentas bancarias, envíos, mensajes | No | **No** | Sí |

El **jefe de tienda** está pensado para quien dirige la operación diaria: ve y resuelve todo, pero no cambia la configuración del sistema ni a las personas que lo usan.

## 4. Bandeja: conversaciones

### La lista (izquierda)
- Pestañas: **Sin asignar** (nadie las tiene), **Mías** y **Todas**. Un agente con la visibilidad limitada solo ve **Mías**.
- **Buscar** por nombre, teléfono o texto, y **Filtros** (estado, canal, quién atiende). El jefe de tienda y el administrador también filtran por **asesor**.
- Cada fila muestra el último mensaje, el canal, **quién atiende** (el asistente, una persona o nadie) y los mensajes sin leer.

### Quién atiende
Arriba de cada conversación hay un selector **Quién atiende: Asistente / Asesor**.
- Con **Asistente**, el asistente responde solo (precios, existencias, horarios, envíos, formas de pago, el estado del pedido del propio cliente).
- Pasa solo a una persona cuando el cliente la pide, manda una **imagen o audio**, dice que **ya pagó**, o quiere comprar o apartar. La conversación queda marcada **«Esperando asesor»**.
- Cuando una persona escribe, el asistente se calla. Puede devolvérselo con **Asistente**.
- El asistente **nunca crea pedidos ni confirma pagos**: eso siempre lo hace una persona.

### Atender una conversación
1. **Asignársela:** menú **Más → Asignarme esta conversación**. El sistema también reparte solo entre los agentes disponibles (el que tenga menos conversaciones abiertas).
2. **Responder:** escriba abajo y **Enviar**. Con `/` aparecen las **respuestas rápidas** (por ejemplo `/horario`).
3. **Notas internas:** solo las ve el equipo; no se mandan al cliente.
4. **Imágenes** del cliente: se ven en la conversación (aquí también se registran comprobantes, ver sección 6).
5. **Ficha del cliente** (derecha, **Más → Ver ficha**): datos, canales, etiquetas, conversaciones anteriores y compras. Puede **Editar datos**, **Agregar etiqueta** y **Generar resumen** de la conversación.
6. Si un mensaje no salió, aparece **Reintentar** en su burbuja.

### Cambiar el estado
Menú **Más**: **Marcar como pendiente / abierta** o **Cerrar conversación**.

### Devolver una conversación
Si no puede atenderla, **Más → Devolver a la cola** (con un motivo opcional). Vuelve a «Sin asignar» y no le cae otra vez a usted.

### La regla de las 24 horas (WhatsApp, Facebook, Instagram)
Solo se puede escribir libremente durante **24 horas** desde el último mensaje del cliente. Pasado ese tiempo:
- En **WhatsApp** aparece el aviso con el botón **Enviar plantilla**: se elige una plantilla aprobada y se llenan sus datos.
- En **Facebook e Instagram** no se puede enviar nada hasta que el cliente escriba.
- Cuando quedan menos de 3 horas, la bandeja lo avisa.

## 5. Su disponibilidad (agentes)

Los agentes tienen un estado que se ve en la barra de arriba:
- **Disponible:** recibe conversaciones nuevas automáticamente. Es el estado al iniciar sesión.
- **En pausa:** no recibe conversaciones nuevas. Use **Pausar** y elija el motivo (**Almuerzo**, **Atendiendo en tienda**, **Otro** o **Sin motivo**). Para volver, **Activarme**.
- **Desconectado:** al cerrar sesión, o si el sistema no recibe señal suya durante **5 minutos** (por ejemplo, si cierra la pestaña).

Si lleva **15 minutos en pausa** el sistema le avisa. Si hay muchas conversaciones sin asignar y nadie disponible, quedan en **Sin asignar** hasta que alguien se active.

El jefe de tienda y el administrador **no tienen estado**: ven el resumen del equipo («Equipo · N de M disponibles») y pueden cambiar el estado de un agente o **Repartir sus conversaciones** (aparece cuando lleva más de 30 minutos en pausa o desconectado y tiene conversaciones abiertas).

## 6. Pedidos y pagos

### Crear un pedido
Desde la conversación: botón **Crear pedido** (se abre un panel).
1. **Cliente:** nombre, teléfono y municipio (ya vienen de la ficha).
2. **Productos:** busque en el catálogo y **Agregar**. Cada producto muestra su precio y «Disponible N · Apartado N».
3. **Entrega:** **Recoger en tienda** o **Envío** (elija la zona; el costo se calcula solo).
4. **Descuento** (opcional): monto o porcentaje, con motivo. El agente tiene un límite; el jefe de tienda y el administrador no.
5. **Notas del pedido**: solo las ve el equipo.
6. Revise el **Resumen** (lo calcula el servidor, no se puede alterar).
7. **Guardar borrador** (no aparta nada) o **Enviar al cliente**: aparta las existencias y le manda el resumen con las cuentas bancarias.

Si el canal no permite enviar (por ejemplo, pasaron las 24 horas), el botón dice **Copiar mensaje y marcar como enviado**: copia el texto para que lo mande por otro medio y deja el pedido igualmente apartado.

### Cuánto dura la reserva
Los productos quedan **apartados** por las horas que configure el administrador (24 de fábrica). Si no llega el pago, el pedido pasa solo a **Vencido** y se liberan. Un vencido se puede **Reactivar pedido** si todavía hay existencias.

### Registrar un comprobante
Cuando el cliente manda la foto del depósito o transferencia, aparece **Registrar como comprobante** bajo la imagen (o **Registrar comprobante** dentro del pedido). Complete:
- **Método** (transferencia, depósito, y los que el administrador haya activado), **Banco**, **Referencia o número de boleta**, **Monto** y **Fecha del pago**.

El pedido pasa a **Pago en revisión** y el cliente recibe «Recibimos su comprobante». Si ya existe otro pago con el mismo banco y referencia, el sistema **avisa de un posible duplicado** (no lo bloquea).

### Verificar un pago (quien tenga permiso)
En **Pedidos → Por verificar** (o en el detalle: **Verificar pago**) se ve el comprobante junto a los datos.
- **Aprobar:** si lo verificado cubre el total, el pedido pasa a **Pagado** y se descuenta la existencia. El cliente recibe «Confirmamos su pago».
- **Rechazar:** escriba el motivo; puede editar el mensaje que recibirá el cliente. El pedido vuelve a **Pendiente de pago**.
- **Pagos parciales:** si se paga una parte, el pedido muestra «Pagado Q800 de Q1,250 · Falta Q450» y vuelve a esperar el resto (ya no vence solo).

### Pago con tarjeta (cuando el administrador lo haya activado)
En un pedido **pendiente de pago** aparece **Enviar enlace de pago con tarjeta**: el sistema le manda al cliente un enlace seguro por el saldo. Cuando el cliente paga, el pedido pasa solo a **Pagado**, sin que nadie verifique. Si el monto no coincide o el pedido ya no esperaba pago, queda **en revisión** con un aviso para que lo resuelva una persona.

### Estados de un pedido
**Borrador → Pendiente de pago → Pago en revisión → Pagado → Preparando → Listo para recoger / Enviado → Entregado.** También **Cancelado** y **Vencido**.

Dentro del pedido, el botón principal siempre es el siguiente paso: **Marcar como preparando**, **Marcar como listo para recoger** (avisa al cliente), **Marcar como enviado** (pide el número de **guía**, que se le manda al cliente) y **Marcar como entregado**.
La hoja **Bodega** (imprimible, sin precios) sirve para empacar.

### Cancelar
**Cancelar pedido** libera lo apartado. Un agente solo cancela los pedidos que creó y mientras no tengan un pago verificado; el jefe de tienda y el administrador, cualquiera (si ya estaba pagado, se devuelve la existencia).

### La lista de pedidos
Pestañas: **Por verificar**, **Pendientes de pago**, **En proceso**, **Entregados** y **Todos**; con búsqueda y filtros por estado, canal, fechas y entrega.

## 7. Contactos

- **Buscar** por nombre o teléfono y filtrar por etiqueta o canal.
- La **ficha** muestra los canales del cliente, sus etiquetas, **notas**, conversaciones anteriores y **compras** (pedidos y total comprado).
- Los teléfonos de Guatemala se escriben con 8 dígitos.
- **Unir contactos** (jefe de tienda y administrador): cuando un mismo cliente quedó duplicado, se unen en uno y los pedidos pasan al que se conserva.

## 8. Catálogo

- Todos ven los productos con su precio y existencias («En existencia», «Quedan N», «Agotado») y por ubicación, con «Disponible · Apartado».
- **Jefe de tienda y administrador:** **Nuevo producto** (nombre, SKU, categoría, precio, descripción, fotos de hasta 5 MB en JPG, PNG o WebP) y edición de existencias por ubicación.
- **Importar CSV** (jefe de tienda y administrador): archivo guardado desde Excel con las columnas `sku, nombre, categoria, precio, descripcion, existencia_tienda, existencia_linea`. Son obligatorias **sku, nombre y precio**. El sistema muestra una revisión antes de importar y marca las filas con errores.

## 9. Reportes (jefe de tienda y administrador)

Con rango de fechas y filtro por canal:
- **Atención:** conversaciones nuevas, tiempo de primera respuesta, resueltas por el asistente, motivos de consulta, productos más consultados, mensajes por hora.
- **Ventas:** pedidos creados, ventas confirmadas (cuentan el día en que se confirmó el pago), ticket promedio, pagos por verificar, pedidos vencidos, productos más vendidos.
- **Asistente:** su costo por día y lo acumulado del mes contra el presupuesto.
- Se puede **exportar a CSV** para abrirlo en Excel.

## 10. Ajustes (solo administrador)

Al entrar, si aún faltan cosas para trabajar con datos reales, se abre **Primeros pasos**: una lista que se marca sola (datos del negocio, cuentas, envíos, catálogo, equipo, preguntas frecuentes, canal conectado…) con un botón directo a cada pendiente.

| Sección | Qué se configura |
|---|---|
| **Primeros pasos** | La lista de lo que falta para trabajar con datos reales |
| **Usuarios** | **Invitar usuario** (nombre, correo y rol: Agente, Jefe de tienda o Administrador; se muestra una contraseña temporal **una sola vez**). En cada fila: cambiar de rol, **Restablecer contraseña**, desactivar, y el interruptor de **Verifica pagos** para los agentes |
| **Equipo** | Cómo se asignan las conversaciones (automática o manual), si los agentes ven solo lo suyo, y el estado de cada agente |
| **Respuestas rápidas** | Los atajos con `/` y sus textos |
| **Etiquetas** | Las etiquetas de los clientes |
| **Asistente** | Encendido, mensaje de bienvenida, canales donde responde, tope mensual de gasto, **Preguntas frecuentes** y una zona para **probar** al asistente |
| **Canales** | Qué canales están conectados y qué falta de cada uno |
| **Datos del negocio** | Nombre, dirección, horario semanal, y los textos de formas de pago, envíos y garantía que usa el asistente |
| **Pagos y envíos** | Métodos de pago activos, prefijo y horas de reserva, descuento máximo del agente, inventario separado o compartido, envío gratis, **cuentas bancarias**, **zonas de envío** y los **mensajes** que se mandan al cliente (se pueden editar y apagar) |

**Importante al dar de baja a alguien:** *Desactivar* bloquea su entrada al instante y deja sin asignar sus conversaciones para que nadie quede esperando. Siempre debe quedar al menos un administrador activo.

## 11. Problemas frecuentes

| Problema | Qué hacer |
|---|---|
| «No puedo escribir al cliente» | Pasaron más de 24 horas. En WhatsApp use **Enviar plantilla**; en Facebook o Instagram, espere a que escriba |
| «Un mensaje salió con error» | Use **Reintentar** en su burbuja. Si es WhatsApp y pasaron las 24 horas, use la plantilla |
| «No veo una conversación que otro agente atiende» | Es lo normal: los agentes ven solo lo suyo. Pídale al jefe de tienda o administrador que se la asigne |
| «No me llegan conversaciones nuevas» | Revise que su estado sea **Disponible** (barra de arriba) y no **En pausa** |
| «El pedido dice que no hay existencia» | Quien tenga permiso (jefe de tienda o administrador) puede apartarlo **«sobre pedido»** |
| «El sistema me bloqueó al entrar» | Esperó 5 intentos fallidos: espere 15 minutos o pida que le restablezcan la contraseña |
| «Olvidé mi contraseña» o «quiero cambiarla» | Solo un administrador puede hacerlo (**Ajustes → Usuarios → Restablecer contraseña**) |
| «El pago con tarjeta quedó en revisión» | El monto cobrado no coincidió o el pedido ya no esperaba pago; verifique en la conversación el aviso del sistema y resuélvalo con el administrador |

## 12. Glosario

- **Apartado:** unidades reservadas por un pedido que aún no se paga; no cuentan como disponibles.
- **Bandeja:** el lugar donde llegan todas las conversaciones.
- **Comprobante:** la foto del depósito o transferencia que manda el cliente.
- **Disponible:** unidades que se pueden vender (existencia menos lo apartado).
- **Plantilla:** mensaje aprobado por WhatsApp que se puede enviar pasadas las 24 horas.
- **Sobre pedido:** apartar productos aunque no alcance la existencia (jefe de tienda y administrador).
- **Ventana de 24 horas:** el tiempo en que se puede escribir libremente después del último mensaje del cliente.
