# Home Outlet CRM — Estado actual (fases 1, 2 y 2.5, pulido de interfaz, equipo de asesores y preparación para producción)

Documento para dar contexto a otra IA que planifica las siguientes fases. Describe **lo que existe hoy**, cómo está construido, las decisiones tomadas y lo que está pendiente. Todo lo que se ve es **contenido de demostración**: es un proyecto privado para presentar a un cliente, todavía no está publicado.

## 1. Qué es

CRM para **Home Outlet S.A.** (Guatemala): una bandeja única donde llegan los mensajes de los clientes de varios canales, con contactos, catálogo con existencias, un **asistente con IA** que atiende primero, **pedidos con pago por transferencia o depósito** y reportes de atención y de ventas.

- Interfaz **toda en español**, trato de **«usted»**. Moneda: quetzales (se guarda en centavos). Hora de Guatemala (UTC-6, sin horario de verano).
- Reglas de trabajo acordadas: usar solo los tokens del sistema de diseño, **proponer funciones nuevas antes de inventarlas**, no publicar ni desplegar sin confirmación, dinero calculado siempre en el servidor.
- Documentos de origen: `HOME-OUTLET-CRM-FASE-1.md`, `HOME-OUTLET-CRM-FASE-2-IA.md`, `HOME-OUTLET-CRM-FASE-2-5-PEDIDOS.md`, `LUMACODE-ESTANDAR-WEB-v2.md`.

## 2. Estado por fase

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Sistema de diseño, base de datos, login y roles, interfaz de canales + simulador, bandeja, contactos, catálogo y CSV, ajustes y permisos, pruebas | **Terminada y aprobada** |
| 2 | Asistente con IA, ayudas para el agente, ajustes del asistente, evaluación, reportes | **Terminada y aprobada** |
| 2.5 | **Pedidos y pagos por transferencia o depósito**: crear pedido desde la conversación, comprobantes y verificación, entrega, avisos al cliente, reportes de ventas | **Terminada y aprobada** (los datos reales del negocio siguen pendientes, ver 17) |
| UI | **Pulido de interfaz** (`HOME-OUTLET-CRM-UI-PULIDO.md`): paleta de estados, canales, componentes nuevos, bandeja, pedidos, contactos, catálogo y reportes rehechos sin tocar lógica ni esquema | **Hecho y aprobado** |
| Equipo | **Asignación automática, visibilidad por asesor y disponibilidad según la sesión** (sección 8b), en 5 etapas | **Hecho y aprobado** (revisado con dos sesiones a la vez) |
| Producción | **Preparación para producción sin credenciales** (sección 19): estado compartido en la base, seguridad de despliegue, respaldos, salud y errores, pruebas de punta a punta, Claude probado contra una API simulada, adaptadores de Facebook e Instagram | **Hecho. Pendiente de visto bueno.** |
| Cierre | **Rol «Jefe de tienda»**, **pago con tarjeta** con pasarela simulada, **salir de la demo** y **Primeros pasos**, y el empaquetado para publicar (`Dockerfile`, revisión automática, `DESPLIEGUE.md`) | **Hecho. Pendiente de visto bueno.** |
| 3 | Pago con tarjeta con un proveedor real, conectar canales reales (WhatsApp oficial, Facebook, Instagram), publicar en un servidor | Pendiente (necesita credenciales y decisiones del cliente) |

## 3. Pila técnica

- **Next.js 16** (App Router, componentes de servidor + *server actions*, `after()` para trabajo posterior a la respuesta), **React 19**, **TypeScript estricto** (`noUncheckedIndexedAccess`).
- **Tailwind v4** con tokens en variables CSS (`@theme inline`, utilidades `@utility` para estilos de texto).
- **Prisma 7** con `@prisma/adapter-pg`, cliente generado en `generated/prisma`. **PostgreSQL** (en desarrollo, `embedded-postgres` con `npm run db`, puerto 5433).
- **Auth.js (next-auth v5 beta)** con credenciales y JWT, `bcryptjs`, límite de intentos de login **en la base** (tabla `IntentoTasa`; vale con varios servidores).
- **Zod 4** para validar entradas, `@anthropic-ai/sdk`, `lucide-react`. Sin librerías de gráficas ni de componentes: todo es propio.
- Archivos subidos (fotos de productos, imágenes de la bandeja y comprobantes) en la carpeta `uploads/`, servidos por `/api/archivos/[nombre]` (`lib/almacenamiento.ts` es el único punto a cambiar para usar un servicio de archivos).
- Actualización «en vivo» por **consultas periódicas** (hook `useActualizacion`, `lib/tiempo-real.ts`): la lista y la conversación cada 4 s, pedidos cada 6–10 s. No hay WebSockets.

Comandos (`package.json`): `dev`, `build`, `db`, `db:migrar`, `seed`, `test` (en serie, comparten base), `e2e` (navegador real, ver sección 19), `ai:eval`, `typecheck`, `respaldo`, `restaurar`.

## 4. Pantallas y rutas

Todo bajo `app/(app)/`, protegido por sesión.

| Ruta | Quién | Qué hace |
|---|---|---|
| `/login` | todos | Inicio de sesión |
| `/bandeja`, `/bandeja/[id]` | todos | Lista de conversaciones + conversación + ficha del cliente. Botón **Crear pedido** y **Registrar como comprobante** en las imágenes del cliente |
| `/pedidos` | todos | Lista con filtros (estado, canal, fechas, entrega, «Pagos por verificar», búsqueda), carga por páginas |
| `/pedidos/[id]` | todos (verificar pagos solo con permiso) | Detalle: productos, totales, entrega y guía, pagos con comprobantes, historial, cambio de estado |
| `/pedidos/[id]/bodega` | todos | Hoja imprimible para empacar, sin precios |
| `/contactos`, `/contactos/[id]` | todos (unir contactos: admin y jefe de tienda) | Lista, ficha, etiquetas, notas, conversaciones anteriores, **compras** |
| `/catalogo`, `/catalogo/nuevo`, `/catalogo/[id]`, `/catalogo/importar` | todos ven; **admin** y **jefe de tienda** crean/editan/borran | Productos, fotos, existencias por ubicación (muestra «Disponible · Apartado»), categorías, CSV |
| `/reportes` | **admin** y **jefe de tienda** | Atención, **ventas** y costo del asistente; exportar CSV |
| `/ajustes` y subpáginas | **admin** | `negocio`, **`pagos-envios`**, `usuarios` (incluye permiso de verificar pagos), `etiquetas`, `respuestas`, `canales`, `asistente` (+ `preguntas`, `probar`) |
| `/ajustes/equipo` | **admin** | Modo de asignación, visibilidad por asesor y **tabla del equipo** (estado, desde cuándo, abiertas, cambiar estado, «Repartir sus conversaciones») |
| `/simulador` | **admin**, no existe en producción | Escribir como cliente por cualquier canal, mandar imágenes y un **comprobante de ejemplo** |
| `/ajustes/primeros-pasos` | **admin** | Lista que se marca sola con lo que falta para trabajar con datos reales; es la pantalla de entrada de Ajustes mientras falte algo |
| `/pagar/[id]` | público, solo con `PASARELA=simulada` y fuera de producción | Página de pago de la pasarela **simulada** (no existe con un proveedor real ni en producción) |
| `POST /api/pagos/webhook` | la pasarela de tarjeta | Aviso firmado de un cobro; idempotente; 404 si no hay pasarela |
| `/sistema` | **admin** | Guía de estilo del sistema de diseño + guía del asistente y de las gráficas |
| `/api/webhooks/[canal]` | externo | Entrada de mensajes de canales (idempotente, verifica firma; pasadas 30 firmas inválidas en 15 min desde una IP confiable responde 429) |
| `GET /api/salud` | hosting | Dice si el servicio responde y llega a la base (`{ok:true}` o 503). Pública y sin datos |
| `POST /api/tareas/vencer-reservas` | cron externo | Vence reservas sin pago. Exige `Authorization: Bearer <TAREAS_SECRET>`; sin la variable la ruta no existe |
| `POST /api/tareas/desconectar-asesores` | cron externo (cada minuto) | Pasa a Desconectado a quien lleva 5 min sin señal. Mismo secreto |

Responsive: la barra lateral pasa a barra inferior en móvil. Hasta 6 botones; si no caben (admin), quedan 4 más **«Más»** (Reportes, Ajustes, Salir). Verificado sin desbordes a 360, 768 y 1440 px y con axe-core sin violaciones.

## 5. Roles y permisos (`lib/permisos.ts`, validados en el servidor)

- **Admin:** todo. Asigna a cualquiera, cierra cualquiera, une contactos, gestiona productos, ve ajustes, reportes, simulador y guía de estilo; da descuentos sin tope, aparta «sobre pedido», cancela cualquier pedido y verifica pagos.
- **Jefe de tienda** (`jefe_tienda`): ve y gestiona **todo lo operativo** como el admin (conversaciones, contactos y pedidos de todos sin límite de visibilidad, asigna y reasigna, cierra cualquiera, estado del equipo y «Repartir sus conversaciones», verifica pagos, cancela cualquier pedido, descuentos sin tope, «sobre pedido», catálogo y existencias, unir contactos y reportes), pero **no** entra a Ajustes (usuarios, canales, asistente, cuentas bancarias, envíos, mensajes), ni al simulador ni a `/sistema`. No tiene estado de disponibilidad ni recibe conversaciones solo. Todo sale de `lib/permisos.ts` (`veTodo`, `esAdmin`…); una prueba (`tests/roles.test.ts`) falla si alguien vuelve a comparar `rol === "admin"` a mano.
- **Agente:** solo se asigna a sí mismo y solo si la conversación está libre o ya es suya; cierra solo las que tiene asignadas; **con «Los asesores ven solo sus conversaciones» (activo de fábrica) solo ve las conversaciones asignadas a él y los contactos y pedidos ligados a ellas** (ver 8b); ve el catálogo; no gestiona productos, ajustes ni reportes.
- **Pedidos (agente):** crea, guarda y envía pedidos; da descuento solo hasta el límite de Ajustes (0 % de fábrica); registra comprobantes; cambia el estado de entrega; **cancela solo lo que creó y mientras no haya un pago verificado**; **verifica o rechaza pagos solo si el admin le activó `puedeVerificarPagos`** (Ajustes → Usuarios).

## 6. Modelo de datos (Prisma)

Enums: `Rol`, `Canal` (whatsapp, tiktok, instagram, facebook, simulado), `EstadoConversacion`, `Direccion`, `TipoMensaje`, `EstadoEntrega`, `Autor`, `AtendidaPor`, `Motivo`, `ModoAsistente`, `ResultadoIa`, y de la fase 2.5: `EstadoPedido` (borrador, pendiente_pago, en_revision, pagado, preparando, listo_para_recoger, enviado, entregado, cancelado, vencido), `Entrega` (recoger/envio), `TipoPago` (transferencia, deposito, efectivo_en_tienda, tarjeta), `EstadoPago` (en_revision/verificado/rechazado), `TipoCuenta`, `ModoInventario` (separado/compartido).

También `EstadoCobro` (creado, pagado, fallido) y el rol `jefe_tienda` en `Rol`.

Modelos:
- **User** (rol, activo, `puedeVerificarPagos` y, del equipo: `estadoAsesor`, `estadoDesde`, `motivoPausa`, `ultimaSenal`, `ultimaAsignacionEn`), **Contact** (+ `asesorResponsableId`, `creadoPorId`), **ChannelIdentity**, **Conversation** (+ `excluirAsesorId`), **HistorialEstadoAsesor**, **AjustesEquipo** (una fila: modo de asignación, visibilidad), **Message** (también `pedidoId`: resumen o aviso de un pedido), **Note**, **Tag**.
- **Category**, **Product**, **Location**, **Stock** (`cantidad` y `apartado`; disponible = cantidad − apartado).
- **QuickReply** (variables `{negocio}`, `{horario}`, `{direccion}`, `{pagos}`, `{envios}`, `{garantia}`, `{cuentas}`), **ActivityLog**, **Negocio**.
- Fase 2: **AiSettings**, **KnowledgeItem**, **AiRun**, **ConversationSummary**.
- Producción: **CobroTarjeta** (un cobro pedido a la pasarela: pedido, pasarela, id externo único, monto, estado, enlace), **Candado** (candados y marcas de tiempo compartidos entre procesos) e **IntentoTasa** (intentos fallidos para los límites).
- Fase 2.5: **Order** (código `HO-000123` consecutivo, estado, totales en centavos, entrega, `reservadoHasta`, `sobrePedido`), **OrderItem** (nombre, precio y SKU **copiados** al pedir; ubicación de salida), **Payment** (método, banco, referencia, monto, fecha, comprobante por mensaje o archivo, estado, quién registró y verificó, motivo de rechazo), **OrderEvent** (historial de estados: usuario, «sistema» o «asistente»), **BankAccount**, **ShippingZone**, **AjustesPedidos** (una fila: prefijo, contador, horas de reserva, descuento máximo del agente, modo de inventario, métodos activos, envío gratis, ubicaciones de salida, textos de mensajes). La base misma impide apartado y montos negativos (restricciones `CHECK`).

Migraciones aplicadas incluyen backfills y las restricciones de pedidos (`pedidos`, `mensajes_pedidos`).

## 7. Canales (`lib/canales/`)

- **Interfaz `ChannelAdapter`** común: enviar mensaje, normalizar entrante, verificar webhook, estado de entrega.
- **Simulado:** completo, solo fuera de producción; acepta texto, imagen y tarjetas de producto. En `/simulador` el «teléfono del cliente» muestra las tarjetas igual que la bandeja y puede **mandar imágenes**. Escribir `/fallar` fuerza un envío fallido para probar reintentos.
- **WhatsApp:** adaptador **terminado y probado con Meta simulado** (`tests/whatsapp.test.ts`, 9 pruebas), **envío real probado** (5 nov 2026: Meta aceptó un texto al celular del dueño con el número de prueba) y **recepción probada de punta a punta** con un túnel temporal (5 nov 2026: llegó un mensaje del celular del dueño, el asistente respondió con el flujo normal y los estados «enviado» y «entregado» se actualizaron). Gotcha: además del webhook hay que suscribir la app a la cuenta de WhatsApp (`POST /<WABA>/subscribed_apps`); sin eso Meta no entrega nada. El túnel de pruebas (localhost.run por `ssh`) es temporal: para producción hace falta una dirección pública fija. Envía texto, imagen y tarjeta de producto (imagen con pie de foto: nombre, precio, existencia); las imágenes del sistema se suben a WhatsApp (`POST /media`) y se mandan por id (no necesitan dirección pública). Recibe texto e imágenes (se descargan y guardan) y estados de entrega; el resto llega como `unsupported`. Falta, para usarlo: las 4 variables `WHATSAPP_*` en `.env`, `CHANNELS_ENABLED=simulado,whatsapp`, y el webhook público (`/api/webhooks/whatsapp`) configurado en Meta. **Plantillas aprobadas** (mensajes fuera de las 24 h): construidas y **probadas con Meta real** (5 nov 2026, con la ventana forzada a 30 h: la ventana lista las plantillas aprobadas de la cuenta, se llenan las variables y llegó al celular). `listTemplates` del adaptador pide `GET /<WABA>/message_templates` (necesita `WHATSAPP_BUSINESS_ACCOUNT_ID`, opcional); `OutboundMessage.type = "template"`; la acción `enviarPlantilla` arma el texto en el servidor con la plantilla que devuelve el canal; `components/ui/plantillas.tsx` (`ModalPlantillas`, en `/sistema`); el mensaje se guarda como texto ya armado. Solo se ofrecen las plantillas llenables (cuerpo con variables numeradas, encabezado de texto, botones sin variables); no carruseles, medios ni autenticación. Un envío fallido de plantilla no se puede «reintentar» desde la burbuja (se reenviaría como texto libre y la ventana lo rechaza): se vuelve a enviar con el botón de plantillas. El canal simulado tiene dos plantillas de ejemplo. La cuenta de Meta for Developers y la app «Home Outlet» ya existen con el número de prueba gratuito de Meta.
- **Facebook e Instagram** (`meta-mensajeria.ts`, un solo archivo para los dos): adaptador **terminado y probado solo contra una simulación de la API de Meta** (`tests/meta-mensajeria.test.ts`, 27 pruebas, siguiendo la documentación oficial): **no se ha probado con Meta real** (falta la cuenta). Envía texto (si pasa del límite del canal —1000 bytes en Instagram, 2000 en Facebook— se parte en varios mensajes por líneas), imagen y tarjeta de producto (foto y luego texto; no hay pie de foto). Las fotos del sistema se suben a Facebook (API de adjuntos) y se mandan por id; **Instagram solo acepta imágenes por dirección pública (https)**, así que sin una dirección pública sale solo el texto. Recibe texto e imágenes; el resto llega como `unsupported`. Estados: Facebook avisa «entregado» por mensaje e Instagram «leído» por mensaje. No hay plantillas (fuera de las 24 h no se envía). Variables: `FACEBOOK_PAGE_TOKEN/PAGE_ID/APP_SECRET/VERIFY_TOKEN` e `INSTAGRAM_TOKEN/ACCOUNT_ID/APP_SECRET/VERIFY_TOKEN` (ver `.env.example`) y agregarlos a `CHANNELS_ENABLED`; sin todas sus variables el canal aparece como pendiente. El GET de verificación del webhook lo resuelve cada adaptador (`verifySubscription`).
- **TikTok** existe como valor del enum y aparece en datos de demostración, **pero no tiene adaptador**. Ahí solo se escriben notas. Un pedido en esos canales se envía con **«Copiar mensaje y marcar como enviado»**: aparta igual y deja una línea del sistema «Resumen enviado fuera del sistema».
- **Ventana de 24 horas** (`ventana.ts`): no se puede responder pasadas 24 h del último mensaje del cliente; con la ventana cerrada, el pedido también usa «copiar y marcar como enviado».
- Webhook idempotente.
- **Limitación conocida:** el sistema aún no consulta qué soporta cada canal antes de enviar una tarjeta. Al conectar canales reales cada adaptador deberá traducirla.

## 8. Bandeja (`app/(app)/bandeja/`)

- **Lista:** búsqueda, filtros de estado, canal y atención, pestañas **Sin asignar / Mías / Todas**, contador de no leídos, carga por páginas. Orden por último mensaje, como WhatsApp.
- **Conversación:** burbujas con estado de entrega y **reintentar**, texto, imagen, tarjeta de producto, respuestas rápidas con `/`, **notas internas**, líneas del sistema (asignaciones, pases a asesor, **pedidos y pagos**), etiqueta «Asistente».
- **Crear pedido** (panel lateral): cliente, productos con foto, precio y «Disponible · Apartado» por ubicación (sugeridos arriba: tarjetas enviadas y productos que consultó el asistente), entrega (recoger o envío con zona y costo automáticos), descuento con motivo, notas y **resumen calculado en el servidor**. «Guardar borrador» y «Enviar al cliente» (aparta las existencias y manda el resumen con las cuentas). Con un pedido abierto ofrece «Ver pedido abierto» o «Crear otro».
- **Registrar como comprobante:** botón bajo cada imagen del cliente si hay un pedido esperando pago; pide método, banco, referencia, monto y fecha; el pedido pasa a «pago en revisión» y se avisa al cliente.
- **Ficha lateral:** datos del cliente, canales, etiquetas, motivo, resumen, conversaciones anteriores y **Compras** (pedidos, total comprado).
- **Barra del asistente** en cada conversación: interruptor, «Tomar conversación» y «Devolver al asistente».

## 8b. Equipo: asignación, visibilidad y disponibilidad — `lib/equipo/`, `lib/visibilidad.ts`

- **Disponibilidad** (`estado.ts`): Disponible / En pausa / Desconectado. Iniciar sesión → Disponible; cerrar sesión → Desconectado; el asesor pausa con motivo opcional (Almuerzo, Atendiendo en tienda, Otro) y se activa. La aplicación abierta llama `latido()` cada 10 s (contexto `ProveedorLatido`, compartido por la barra lateral y la barra superior) y devuelve no leídos, «sin asignar» y su estado; 5 min sin señal → Desconectado (`desconectarInactivos`, con límite de 30 s por proceso, más la ruta de cron). Cada cambio cierra y abre una fila de `HistorialEstadoAsesor` (con el origen: manual, sistema, admin) y es atómico. Aviso con ventana a los 15 min en pausa (y cada 15), con notificación del navegador y sonido si la pestaña está oculta.
- **Reparto** (`asignacion.ts`): función pura `elegirAsesor` (responsable disponible → menos conversaciones abiertas → quien lleva más tiempo sin recibir). `asignarConversacion` corre en una transacción con `pg_advisory_xact_lock` y `updateMany` condicionado a que siga sin asignar: nunca se asigna dos veces. Sin nadie disponible queda en «Sin asignar»; al volver un asesor (`procesarCola`) se reparten de la más antigua a la más nueva. En modo Manual no se asigna sola. El primer asesor que responde queda como **asesor responsable** del contacto; un pedido pagado deja como responsable a quien lo creó.
- **Visibilidad** (`lib/visibilidad.ts`): `filtroConversacion/Contacto/Pedido` y `puedeVer*` se aplican en toda consulta y en cada acción que recibe un id; lo ajeno responde 404 («no existe»). Cubre lista, búsqueda, contadores, no leídos, notificaciones, archivos (`/api/archivos`), pedidos, bodega y duplicados de pago (se avisa sin decir cuál). Una prueba recorre los archivos de acciones y falla si una acción con id no está protegida. El admin ve todo y filtra por **Asesor** en Bandeja, Contactos y Pedidos.
- **Reasignar y devolver** (`gestion.ts`): solo el admin reasigna; el asesor usa «Devolver a la cola» (motivo opcional; no vuelve a caer en él, vía `excluirAsesorId`); «Repartir sus conversaciones» aparece con más de 30 min en pausa o desconectado y conversaciones abiertas; el admin puede cambiar el estado de cualquiera. Cada asignación, reasignación, devolución, reparto o falta de asesor deja una línea del sistema en la conversación (`ActivityLog` `asignar`, con `tipo`: automatica, cola, reparto, reasignar, devolver, sin_asesor).
- **Interfaz:** `components/ui/disponibilidad.tsx` y `components/ui/equipo.tsx` (todo en `/sistema`); en la bandeja del admin, resumen «Equipo · N de M disponibles»; en la barra lateral del admin, aviso «N conversaciones sin asignar». Nota: la pestaña **Sin asignar** muestra toda conversación sin dueño (incluida la que aún atiende el asistente), mientras que el aviso cuenta solo las que esperan asesor.

## 9. Pedidos y pagos (fase 2.5) — `lib/pedidos/`

- **Flujo:** borrador → pendiente de pago (aparta) → pago en revisión → pagado (descuenta) → preparando → listo para recoger o enviado → entregado; también cancelado y vencido (liberan lo apartado). Tabla de transiciones en `estados.ts`, validada en el servidor; cada cambio deja un `OrderEvent`. Un vencido se puede reactivar si hay existencias.
- **Existencias** (`existencias.ts`): reservar es atómico (`SELECT … FOR UPDATE` en una transacción), con prueba de dos pedidos simultáneos. Dos modos: **separado** (cada línea sale de una ubicación; por defecto «Recoger» sale de Tienda física y «Envío» de Tienda en línea) y **compartido** (suma las dos; aparta primero de la ubicación de despacho y parte la línea si no alcanza). Un admin puede apartar **«sobre pedido»**.
- **Pagos** (`pagos.ts`): varios comprobantes por pedido (pago parcial: «Pagado Q800 de Q1,250 · Falta Q450»), aviso de **posible duplicado** (mismo banco y referencia; no bloquea), verificación con vista del comprobante junto a los datos, rechazo con motivo y mensaje editable. Un pago parcial verificado devuelve el pedido a «pendiente de pago» y **ya no vence solo**.
- **Mensajes al cliente** (`mensajes.ts`, `avisos.ts`): resumen del pedido (con `{cuentas}`), comprobante recibido, pago confirmado o parcial, pago rechazado, listo para recoger, enviado (con guía), vencido y reserva por vencer (2 h antes, apagado de fábrica). Textos editables y con interruptor por mensaje en Ajustes. Si no hay canal o cerró la ventana, el sistema muestra el texto para copiarlo.
- **Vencimiento** (`vencimiento.ts`): `vencerReservas()` corre al abrir la bandeja, la lista y el detalle de pedidos (a lo más cada 30 s por proceso) y desde el cron.
- **Ajustes → Pagos y envíos:** métodos de pago (tarjeta visible y deshabilitada: «Disponible en la fase 3»), cuentas bancarias, prefijo y horas de reserva, descuento máximo del agente, inventario, envío gratis, zonas de envío y mensajes.
- **Interfaz `MetodoPago`** (`metodos.ts`): la tarjeta ya es un método encendible en Ajustes, **solo si hay una pasarela conectada** (se valida al guardar).
- **Pago con tarjeta** (`lib/pagos-tarjeta/`, ver `PASARELA-TARJETA.md`): en un pedido pendiente de pago, **«Enviar enlace de pago con tarjeta»** pide a la pasarela el cobro por el **saldo** y manda el enlace al cliente (mensaje editable «Enlace de pago con tarjeta»). El proveedor avisa a `POST /api/pagos/webhook` (firma obligatoria); al llegar «pagado» se registra un pago de tarjeta que **se confirma solo** (`confirmarPago("sistema")`, sin «verificado por»): el pedido pasa a Pagado y se descuenta la existencia. Es idempotente; **si el monto no coincide o el pedido ya no esperaba pago, queda «en revisión»** con aviso en la conversación; un solo enlace abierto por saldo; un cobro fallido no registra nada. La interfaz `Pasarela` (`tipos.ts`) es la forma común de Recurrente, Pagadito y los bancarios: conectar uno real es un archivo más. Hoy solo existe la **simulada** (`PASARELA=simulada`, solo fuera de producción). Sin reembolsos, cuotas ni conciliación.

## 10. Asistente con IA (fase 2) — `lib/ia/`

**Proveedores (interfaz `AiProvider`):**
- **Simulado** (por defecto, sin costo ni clave): reglas por palabras clave que llaman a **las mismas herramientas** que el real; español e inglés, captura nombre y municipio, «muéstreme el producto», y ahora «¿ya confirmaron mi pago?», «¿cuándo llega mi pedido?» y «¿a qué cuenta deposito?».
- **Anthropic:** con uso de herramientas y *prompt caching*. **Nunca se ha probado contra la API real** (falta la clave), pero sí contra un servidor local que imita `POST /v1/messages` con el SDK de verdad (`tests/anthropic.test.ts`, 13 pruebas): arma bien la petición (modelo, sistema con caché solo en la parte fija, herramientas sin `$schema`, ida y vuelta de `tool_use`/`tool_result`), lee texto, herramientas y uso con tokens de caché, y reacciona bien a errores, silencio (cancelación), herramientas inexistentes y bucles de herramientas (corta a las 4 vueltas). **Lo que falta con la clave:** el tono y el cumplimiento real de las reglas (correr `npm run ai:eval` con `AI_PROVIDER=anthropic`). `AI_PROVIDER=anthropic` y `ANTHROPIC_API_KEY`; modelo por defecto `claude-haiku-5-5`.

**Herramientas (Zod, `herramientas.ts`):** `buscar_productos`, `ver_producto` (con inventario compartido da solo el total), `datos_negocio`, `buscar_respuesta`, `enviar_producto`, `guardar_dato_cliente`, `pasar_a_asesor` y **`estado_pedido(codigo?)`**: solo devuelve pedidos **del contacto de la conversación** (un código ajeno responde igual que uno que no existe) y solo incluye las cuentas bancarias mientras el pedido espera pago. La existencia que ve el asistente ya descuenta lo apartado.

**Reglas** (en `prompt.ts` y, las críticas, también en código — `reglas.ts`, `atencion.ts`):
- Solo habla de productos, existencias, precios, horarios, envíos, formas de pago y del pedido del propio cliente; resiste la inyección de instrucciones.
- Imagen/audio del cliente, petición de hablar con una persona o **«ya pagué»** → **siempre** pasa a asesor; si hay un pedido esperando pago, el motivo es **«posible comprobante de pago»**. Compras, apartados, pagos y descuentos → asesor.
- **El asistente no crea pedidos ni confirma pagos.** Regla de salida en código (`revisarSalida`): si su respuesta afirma un pago confirmado y el cliente no tiene un pedido con pago verificado, se reemplaza el texto y pasa a un asesor.
- Mensaje de **bienvenida** configurable como primer mensaje.

**Traspaso asistente ↔ persona:** `atendidaPor` + `esperandoAsesorDesde`. Cuando una persona escribe, el asistente se calla; los avisos automáticos de pedidos **no** le quitan la conversación. Al pasar a asesor la conversación queda sin asignar y «esperando asesor».

**Controles y costo:** límite por minuto, máximo de turnos (4), tiempo de espera de 20 s, presupuesto mensual con aviso al 80 % y apagado al 100 %, registro en `AiRun`, precios por millón de tokens configurables (suposiciones: 1 y 5 USD).

**Ayudas para el agente:** Sugerir respuesta, Resumen, motivo automático.

**Evaluación:** `ai/eval/casos.json` (**55 casos**, incluidos pedidos propios y ajenos, cuentas con y sin pedido, «ya pagué» e imagen con pedido abierto; los casos con `pedido` crean un cliente temporal) + `npm run ai:eval`. Hoy 55/55 con el simulado.

## 11. Reportes (`/reportes`, solo admin)

Rango de fechas y filtro por canal. **Atención:** conversaciones nuevas, primera respuesta, resueltas por el asistente, conversaciones por día y canal, motivos, productos más consultados, mensajes por hora. **Ventas:** pedidos creados, ventas confirmadas (una venta cuenta el día en que se confirmó su pago; cancelados y vencidos no cuentan), ticket promedio, % de conversaciones con pedido, pagos por verificar ahora, pedidos vencidos, mediana de tiempo para confirmar un pago, ventas por día y canal, pedidos por estado, productos más vendidos. **Asistente:** costo por día y acumulado del mes contra el presupuesto. Gráficas en SVG propio con resumen para lector de pantalla y tabla de datos; **exportar CSV** con BOM.

## 12. Catálogo y contactos

- **Catálogo:** CRUD de productos con fotos, categoría, precio, activo; existencias por ubicación («Disponible N · Apartado N»); importar/exportar CSV con validación; estados «En existencia», «Quedan N», agotado.
- **Contactos:** búsqueda, ficha con identidades, etiquetas, notas, historial, **compras**, **unir contactos duplicados** (admin; los pedidos pasan al contacto que se conserva).
- Teléfonos de Guatemala (8 dígitos) normalizados.

## 13. Datos de demostración (`npm run seed`)

Borra y recrea solo los datos de demo (**conserva a los usuarios y sus contraseñas**; crea los asesores de demostración Carlos Pérez —Disponible—, Mónica Aguilar —En pausa 42 min, «Almuerzo»— y Luis Herrera —Desconectado—, con conversaciones repartidas, 3 «Sin asignar» y contactos con asesor responsable; las contraseñas nuevas se imprimen solo al crearlos; no corre en producción): catálogo, ~275 contactos, **~1,200 conversaciones de 90 días**, respuestas del asistente, pases a asesor y costos (~USD 3.6/mes), 15 preguntas frecuentes y datos del negocio. Fase 2.5 (`semilla-pedidos.ts`, `demo-pedidos.ts`): 3 cuentas bancarias con número de ceros, 4 zonas de envío (Q15, Q20, Q35 y Q45) y **~80 pedidos** coherentes con las conversaciones (casi todos entregados, algunos vencidos o cancelados, dos con un pago rechazado), más pedidos de hoy pendientes de pago y en revisión (con un posible duplicado) y uno en preparación; las existencias apartadas coinciden. El comprobante de ejemplo es `public/demo/comprobante-demo.png` (lleva la leyenda «DEMO» y no muestra monto). Los datos pendientes del cliente están marcados `// FICTICIO` en el código.

Usuarios de desarrollo: `admin@homeoutlet.test` y `agente@homeoutlet.test` (las contraseñas no se guardan en este documento).

## 14. Calidad

- **313 pruebas automáticas** (`tests/`: canales, adaptador de WhatsApp y plantillas con Meta simulado, bandeja, contactos, catálogo, csv, ajustes, asistente, reportes, de la fase 2.5 pedidos, creación y envío, pagos, vencimiento y permisos, y del equipo: estado y desconexión a los 5 min, reglas de reparto, visibilidad por cada ruta y acción, devolver/repartir y asignación simultánea sin duplicados; y de producción: candados e intentos en la base, IP confiable, revisión del entorno, Claude contra una API simulada y Facebook/Instagram), más **6 de punta a punta** (`npm run e2e`; la del pago con tarjeta pide `PASARELA=simulada` y `E2E_PASARELA=1`), en serie sobre la base real. Las del equipo desactivan y desconectan a los asesores de demostración mientras corren (`tests/apoyo-equipo.ts`) y los restauran: nunca correrlas en paralelo con otras ni con la demo en uso (si se cortan a medias, volver a activar a los usuarios y correr `npm run seed`).
- `tsc` limpio, build de producción correcto, evaluación del asistente 55/55, axe-core sin violaciones en las pantallas nuevas a 360, 768 y 1440 px.
- **No verificado:** Claude real, Facebook e Instagram con Meta real, reordenar fotos arrastrando con teclado, el cron de vencimiento en un servidor.

## 15. Sistema de diseño

Marca **Home Outlet**: naranja + carbón sobre fondo cálido; componentes propios en `components/ui/` (`conversacion`, `estados`, `estructura`, `etiquetas` con las insignias de pedido y de pago, `form`, `graficas`, `pedidos`, `toast`), con un `Selector` propio accesible. Guía viva en `/sistema`. Reglas: solo tokens, texto en español con «usted», foco visible, `aria-live` en listas y registros, `prefers-reduced-motion`.

**Pulido de interfaz (reglas que quedaron):**
- **El naranja es solo para la acción principal y lo que pide atención.** Un solo botón principal por vista. Los enlaces en tablas van en texto principal (`enlaceTabla`), no en naranja.
- **Estados:** paleta `estado-*` (neutro, info, aviso, éxito, peligro), siempre tenue y con ícono. Una sola `InsigniaEstado` para el pedido (ya no hay columna «Pago»); `InsigniaConversacion` para la conversación. Las etiquetas de cliente (`InsigniaEtiqueta`) son neutras con un punto de color; el tono guardado «naranja» se dibuja con punto azul y «aviso» con punto rosa.
- **Canales:** siempre el **logo de la marca** (nunca un ícono genérico): `IconoCanal` (logo con tooltip) en listas y tablas, `LogoCanal` más el nombre en la tercera línea de la bandeja y la ficha, logo en blanco dentro del círculo de `AvatarConCanal`, y logo en cada opción de los selectores de canal (`opcionCanal`, `Selector` acepta `icono` por opción). Solo «Simulado» conserva su ícono de frasco. El `Tooltip` va en posición fija para que ninguna tabla lo recorte ni le abra una barra de scroll. Colores fijos por canal en las gráficas (`COLOR_CANAL`); «Simulado» usa el de «Otros» y no aparece en reportes en producción (`canalesDeReporte`).
- **Componentes nuevos** (todos en `/sistema`): `BotonIcono` (con tooltip), `ControlSegmentado`, `PestanasConContador`, `LineaDePasos`, `AvisoAccionable`, `TarjetaKPI`, `EncabezadoPagina`, `BotonFiltros`, `SeparadorDia`, `AvatarConCanal`, botón `peligro-contorno` (el sólido solo en el modal de confirmación). Avatares solo de 32 y 40 px.
- **Tablas:** fila completa clicable (`alActivar`), cifras a la derecha, columnas de apoyo que se ocultan en pantallas angostas (`ocultarMovil`, `ocultarHastaXl`).
- **Gráficas:** se dibujan a tamaño real (etiquetas de 12 px), 240 px de alto como máximo, una serie en carbón con solo la barra destacada en naranja, costos en `US$`.
- **Foco:** anillo de dos tonos (naranja de 2 px pegado al elemento y carbón de 2 px por fuera, con 2 px de separación). El carbón da más de 3:1 sobre blanco y, sobre fondos oscuros como el sidebar, se ve el naranja. Está en `app/globals.css` (`:focus-visible`).
- **Cuidado al hacer layouts:** un `sr-only` (posición absoluta) dentro de un contenedor con `overflow-x-auto` que no sea `relative` ensancha toda la página en el teléfono; las tablas y la línea de pasos ya llevan `relative`. Un componente de cliente nunca debe importar `lib/db` (ni un archivo que lo importe): rompe la compilación del navegador.

## 16. Decisiones tomadas (para no re-litigarlas)

- `autor` (cliente/asistente/asesor) como campo propio del mensaje, no inferido.
- Horario semanal **estructurado**; «asesor conectado» = señal (`ultimaSenal`) en los últimos 2 minutos.
- Reportes solo para admin. Gráficas en SVG propio.
- Al pasar a asesor, la conversación se desasigna y, en modo Automática, se reparte sola (si nadie está disponible queda en cola). La bandeja ordena por último mensaje.
- **Equipo:** modo Automática y visibilidad por asesor activos de fábrica. Lo ajeno responde 404, no «sin permiso». Devolver a la cola excluye a quien la devolvió. El estado de disponibilidad lo manda la sesión (login/logout/señal), no un interruptor suelto.
- Todo local por ahora; se despliega cuando el cliente apruebe.
- **Pedidos:** el inventario compartido o separado es un ajuste (separado por defecto). Nombre y precio se copian al pedido. El código sale de un contador (consecutivo, sin saltos). Un borrador no aparta; enviar aparta. «Sobre pedido» y descuentos sobre el límite, solo admin.
- **Pagos:** un pago parcial verificado deja el pedido en «pendiente de pago» con su saldo y lo exime de vencer solo; un duplicado solo avisa; un pedido cancelado después de pagado repone la existencia.
- Las líneas del sistema en la conversación («Resumen enviado fuera del sistema», pagos, estados) son filas de `ActivityLog`, no mensajes ni notas.
- Los avisos automáticos de pedido salen como mensaje del equipo sin cambiar quién atiende la conversación.
- `puedeVerificarPagos` se lee de la base en cada petición: el cambio aplica al instante.

## 17. Pendiente y preguntas abiertas

1. **Datos reales** que hoy son ficticios (`// FICTICIO`): bancos y cuentas, zonas y costos de envío, si aceptan efectivo al recoger, horas de reserva, quién verifica pagos, límite de descuento, **si el inventario es compartido o separado**.
2. **Texto de «formas de pago» del negocio:** temporalmente dice «Por ahora cobramos solo por transferencia o depósito bancario. Todavía no aceptamos tarjeta.» (Ajustes → Datos del negocio). Confirmar con Home Outlet y cambiarlo cuando haya tarjeta.
3. **Hosting:** recomendación Railway (servidor con proceso de larga vida, disco para `uploads/`, PostgreSQL, Cron Job para `POST /api/tareas/vencer-reservas`). Sin decidir.
4. **Clave de Anthropic** y presupuesto: falta para probar Claude real (hoy solo está probado contra una API simulada; ver sección 10).
5. **Contenido real:** **logo** (`public/brand/` está vacío; el sidebar sigue con el texto «HOME Outlet»), productos y fotos, horario, dirección, preguntas frecuentes y tono del negocio.
5b. **Decisión de interfaz abierta:** los nombres de los tonos de etiqueta en Ajustes → Etiquetas («Naranja», «Aviso») ya no coinciden con el color del punto. (El anillo de foco ya se resolvió: ver sección 15.)
6. **Fase 3:** una **pasarela de tarjeta real** (ver `PASARELA-TARJETA.md`: la interfaz y la simulada ya están), canales reales (cuenta de Meta Business verificada; Instagram y Facebook ya tienen adaptador, probado solo con Meta simulado; TikTok por definir) y **publicar** (ver `DESPLIEGUE.md`).
7. **Factura electrónica (FEL):** el sistema no guarda NIT, IVA ni factura. Hay una investigación con opciones y preguntas para el cliente en `INVESTIGACION-FEL.md`.
8. **Contenido para el cliente:** `HOJA-DE-ENTREGA-CLIENTE.md` (lo que hay que pedirles) y `MANUAL-DE-USUARIO.md` (para el equipo).

## 18. Antes de publicar (avisos técnicos)

**La receta completa está en `DESPLIEGUE.md`** (Railway o servidor propio, variables, primer administrador con `npm run admin:crear`, respaldos, lista de verificación). Lo que sigue son los avisos técnicos de fondo:

- `AUTH_SECRET` y la clave de la base distintos a los de desarrollo (**el servidor se niega a arrancar en producción si no**, ver sección 19); definir `TAREAS_SECRET` y programar los crons de vencimiento de reservas y de desconexión de asesores (cada minuto).
- Siguen siendo por proceso, y sirven con un solo servidor sin problema (con varios, cada uno tarda unos segundos en ver un cambio): el caché de ajustes del equipo (3 s) y el de plantillas de WhatsApp (60 s), y el de nombres de perfil de Facebook/Instagram (1 h). El límite de login, los límites de revisión (desconectar asesores, vencer reservas) y el bloqueo del asistente ya viven en la base (sección 19).
- En desarrollo, para abrir dos sesiones a la vez usar `localhost` y `127.0.0.1` (cookies separadas); `127.0.0.1` está en `allowedDevOrigins`.
- `uploads/` en un disco persistente, o cambiar `lib/almacenamiento.ts` por un servicio de archivos (los comprobantes de pago están ahí).
- El asistente responde después de contestar al webhook, en el mismo proceso (`after`): sirve para servidor propio; sin procesos de larga vida habría que usar una cola.
- El simulador y la semilla no existen en producción.
- Después de cambiar el esquema y migrar, reiniciar `npm run dev` (el servidor conserva el cliente de Prisma anterior).
- No correr `npm run build` mientras `npm run dev` está abierto: comparten la carpeta `.next`.
- Al presentar la demo, usar ventana de incógnito: la extensión Bitdefender TrafficLight provoca un aviso rojo de hidratación en desarrollo (no es un error del proyecto).

## 19. Preparación para producción (sin credenciales)

Hecho sin necesitar claves ni accesos del cliente, para que el paso de demo a funcional sea solo conectar y probar.

- **Estado compartido en la base** (migración `estado_compartido`): `lib/candados.ts` (`tomarCandado`/`soltarCandado`, tabla `Candado`, atómico y con la hora de la base) reemplaza las variables en memoria de «como máximo cada 30 s» (desconectar asesores, vencer reservas) y el bloqueo que impide que el asistente conteste dos veces la misma conversación (vence solo a los 5 min si el proceso se cae). `lib/limite-intentos.ts` guarda los fallos en la tabla `IntentoTasa`. Con varios servidores, todos ven lo mismo.
- **Error que ya existía y se corrigió:** entrar bien nunca limpiaba el contador de fallos (la redirección de `signIn` cortaba la línea que lo hacía). Ahora limpia los fallos del **correo** al entrar; los de la IP no se limpian, para que quien rocía contraseñas y tiene una cuenta propia no reinicie su límite.
- **IP del cliente** (`lib/ip.ts`): `x-forwarded-for` solo es confiable detrás de un proxy propio. En producción solo se usa si `PROXIES_CONFIABLES=N` (cuántos proxies hay delante) y se toma la dirección del lado derecho, nunca la de la izquierda (la escribe el cliente). Sin eso, o en desarrollo, el login se limita solo por correo. El webhook cuenta las firmas inválidas por IP: pasadas 30 en 15 minutos responde 429.
- **Cabeceras de seguridad** (`next.config.mjs`): `nosniff`, `X-Frame-Options: SAMEORIGIN`, política de referencia, permisos del navegador apagados (cámara, micrófono, ubicación, pagos), una CSP mínima sin `script-src` (Next necesita scripts en línea; cierra marcos ajenos, `base`, formularios a otros sitios y `object`), HSTS solo en producción y sin `X-Powered-By`.
- **Revisión del entorno al arrancar** (`instrumentation.ts` + `lib/entorno.ts`): en producción **se niega a arrancar** con `AUTH_SECRET` ausente, corto o de ejemplo, con la clave de base `postgres:postgres` (salvo `PERMITIR_CLAVE_DE_DESARROLLO=1`, solo para probar la versión de producción en la propia computadora), con un canal activado a medias (WhatsApp, Facebook o Instagram) o con `AI_PROVIDER=anthropic` sin clave. Avisa de lo que queda apagado (cron, IP, asistente simulado, canal simulado, `AUTH_URL`/`AUTH_TRUST_HOST`).
- **Errores y salud:** `lib/registro.ts` escribe una línea JSON por evento (nunca el texto del error ni datos del cliente: solo tipo y código) y `instrumentation.ts` registra cada error del servidor con su ruta; `GET /api/salud` para el hosting.
- **Respaldos:** `npm run respaldo` guarda `base.dump` (`pg_dump`) y `uploads.tar.gz` con fecha en `respaldos/` (o `RESPALDOS_CARPETA`, mejor en otro disco) y conserva los últimos 14 (`RESPALDOS_CONSERVAR`). `npm run restaurar -- <carpeta> --a <URL> --confirmar` (y `--sobre-la-actual` si el destino es la base actual; `--uploads <carpeta>` para extraer los archivos). Necesitan el cliente de PostgreSQL (`pg_dump`/`pg_restore`, o `PG_DUMP`/`PG_RESTORE`). **Probados de punta a punta el 6-nov-2026** con PostgreSQL 18.6: se respaldó la base de desarrollo, se restauró en una base vacía y las 31 tablas y 10 747 filas salieron idénticas, y las 17 fotos de `uploads/` se extrajeron iguales. Los archivos se comprimen por entrada y salida estándar porque el `tar` de Git para Windows confunde `C:\...` con una máquina remota. En Windows hay que indicar `PG_DUMP`/`PG_RESTORE` si el cliente no está en el PATH. Falta repetir la restauración en el servidor real cuando exista.
- **Pruebas de punta a punta** (`e2e/flujos.test.mts`, `npm run e2e`, con `playwright-core` y el Edge o Chrome ya instalados: no descarga navegador): contraseña incorrecta y correcta (y que limpia los fallos), un mensaje del cliente por el simulador con respuesta del asistente, crear y enviar un pedido (aparta 1 unidad), registrar el comprobante y verificar el pago (queda pagado, descuenta y libera lo apartado). Necesitan `npm run db` y `npm run dev`; crean su propio usuario, producto, ubicación y cuenta (prefijo `PRUEBA-E2E`) y al final los borran y devuelven los ajustes de pedidos como estaban. `E2E_URL` y `E2E_NAVEGADOR` cambian la dirección y el navegador.
- **Tareas programadas dentro del servidor** (`lib/programador.ts`, se inicia en `instrumentation.ts` solo en producción): desconectar asesores inactivos (cada minuto), vencer reservas (cada 5 minutos) y, con `RESPALDO_AUTOMATICO=1`, el respaldo diario a las 2:00 de Guatemala. Seguro con varios servidores (candados en la base). Ya no hace falta un cron externo (las rutas `POST /api/tareas/*` siguen existiendo).
- **Empaquetado:** `Dockerfile` (Node 22, `pg_dump` 18 incluido, aplica las migraciones al arrancar), `.dockerignore`, revisión automática de GitHub (`.github/workflows/ci.yml`: base nueva, tipos, pruebas, evaluación del asistente y pruebas de punta a punta, más un job de compilación) y `UPLOADS_DIR` para las fotos. **El `Dockerfile` y el flujo de GitHub no se han corrido** (no hay Docker aquí ni repositorio); su equivalente local sobre una base nueva sí pasó completo.
- **Primer administrador:** `npm run admin:crear -- --nombre "…" --correo …` (la semilla no corre en producción).
- **Salir de la demo:** `npm run demo:limpiar` (por defecto solo **muestra** qué borraría; para borrar exige `--confirmar --base <nombre>`; `--quitar-usuarios-demo` y `--archivos` opcionales; nunca en producción). Conserva a los usuarios y recrea las filas base. Lo prueba `tests/limpieza.test.ts` sobre una base aparte.
- **Contraseñas:** solo el administrador las cambia o restablece (Ajustes → Usuarios); a propósito, ninguna persona puede cambiar la suya. Rol de jefe de tienda: ver la sección 5.
- **Lo que sigue sin poder hacerse sin credenciales:** conectar y probar con Meta real (WhatsApp oficial, Facebook, Instagram), Claude real, la pasarela de tarjeta, el servidor y su dominio.

## 20. Estructura de carpetas

| Carpeta | Contenido |
|---|---|
| `app/(app)/` | Pantallas autenticadas (bandeja, pedidos, contactos, catálogo, reportes, ajustes, simulador, sistema) |
| `app/api/` | Auth, webhooks de canales, archivos subidos, tareas (vencer reservas, desconectar asesores) |
| `lib/equipo/` | Disponibilidad, reparto, gestión (devolver, repartir, panel) y ajustes del equipo; `lib/visibilidad.ts` filtra lo que ve cada asesor |
| `components/ui/` | Sistema de diseño |
| `lib/` | Servicios: mensajería, bandeja, contactos, catálogo, ajustes, reportes, horario, permisos, plantillas, CSV |
| `lib/pedidos/` | Estados, existencias, totales, envío, pedidos, pagos, avisos, mensajes, vencimiento, consultas |
| `lib/canales/` | Interfaz de canales, simulado, WhatsApp preparado, ventana de 24 h |
| `lib/ia/` | Proveedores, herramientas, reglas, atención, ayudas, ajustes y registro |
| `prisma/` | Esquema, migraciones, semilla (`seed.ts`, `semilla-ia.ts`, `semilla-pedidos.ts`, `demo.ts`, `demo-pedidos.ts`) |
| `ai/eval/` | Casos y resultados de la evaluación del asistente |
| `tests/` | Pruebas automáticas |
| `scripts/` | Base local (`db.mjs`), evaluación (`ai-eval.mts`) |
| `public/demo/` | Comprobante de ejemplo para el simulador y los pedidos de demostración |
