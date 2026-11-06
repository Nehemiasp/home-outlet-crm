# Home Outlet CRM

Bandeja única de mensajes, contactos, catálogo y existencias, con un asistente con IA que atiende a los clientes, pedidos con pago por transferencia o depósito, y reportes de atención y de ventas. Hoy funciona con un canal simulado y un proveedor de IA simulado; WhatsApp y Claude quedan listos para conectarse.

## Cómo correrlo

Necesita Node 20 o más nuevo. Cada comando va en su propia terminal cuando se indica.

```bash
npm install
cp .env.example .env        # y complete los valores (AUTH_SECRET: npx auth secret)
npm run db                  # terminal 1: PostgreSQL local para desarrollo (puerto 5433)
npm run db:migrar           # crea las tablas
npm run seed                # datos de demostración (ver abajo)
npm run dev                 # terminal 2: http://localhost:3000
```

Después de cambiar `prisma/schema.prisma` y migrar, reinicie `npm run dev`: el servidor conserva el cliente de base de datos anterior.

- `npm run seed` borra los datos de demostración y los vuelve a crear: el catálogo, 275 contactos, unas 1,200 conversaciones de 90 días con respuestas del asistente, pases a asesor y costos, unos 80 pedidos con sus pagos, las cuentas bancarias y zonas de envío de ejemplo, las preguntas frecuentes y los datos del negocio. **No borra a los usuarios**: si ya existen conservan su contraseña, y solo imprime la de los que crea. No corre en producción.
- `npm test` corre las pruebas, una archivo a la vez porque comparten la base (necesitan la base encendida).
- `npm run ai:eval` corre los casos de `ai/eval/casos.json` contra el proveedor de IA configurado y guarda el resultado con fecha en `ai/eval/resultados/`.
- Pantallas solo para admin: `/sistema` (guía de estilo), `/simulador` (escribir como cliente; no existe en producción), `/ajustes` y `/reportes`.

## El asistente con IA

Responde precios, existencias, horario, ubicación, envíos y formas de pago, y pasa la conversación a una persona cuando hace falta. No sabe nada del negocio por sí mismo: todo lo consulta con herramientas que leen la base de datos (`lib/ia/herramientas.ts`). Las reglas están en `lib/ia/prompt.ts` y las más importantes también se cumplen en el código (`lib/ia/reglas.ts`, `lib/ia/atencion.ts`).

Se configura en **Ajustes → Asistente** (encendido, canales, cuándo responde, bienvenida, límites, presupuesto), con sus **preguntas frecuentes** y una pantalla para **probarlo** sin crear conversaciones.

| Variable | Para qué |
|---|---|
| `AI_PROVIDER` | `anthropic` usa Claude; cualquier otro valor (o vacío) usa el simulado |
| `ANTHROPIC_API_KEY` | Clave de la API. Sin ella el asistente corre en modo de prueba |
| `AI_MODEL` | Modelo. Por defecto `claude-haiku-5-5` |
| `AI_MONTHLY_BUDGET_USD` | Presupuesto mensual si no se escribe uno en Ajustes (por defecto 10). Al 80 % se avisa a los admin; al 100 % el asistente se apaga |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` | Precio por millón de tokens, para estimar el costo (por defecto 1 y 5 USD; ajústelos al modelo que use) |

Pasar del simulado al real es cambiar esas variables y reiniciar el servidor. Con la clave puesta, corra `npm run ai:eval` para ver cuántos casos pasa el modelo.

## Interfaz

La guía de estilo viva está en `/sistema` (solo admin): colores, estados, canales, botones, formularios, conversación, estructura y gráficas, con los estados de hover y foco. Todo componente nuevo entra primero en `components/ui/` y se muestra ahí antes de usarse en una pantalla. El naranja se reserva para la acción principal y lo que pide atención.

## Pedidos y pagos

Se crean desde la conversación (botón **Crear pedido**), se apartan las existencias al enviarlos, el cliente manda la foto del comprobante por el chat y el equipo la registra y la verifica en **Pedidos**. Se configura en **Ajustes → Pagos y envíos**: métodos, cuentas bancarias, zonas de envío, horas de reserva, descuento máximo del agente, inventario separado o compartido y los mensajes que recibe el cliente. El código está en `lib/pedidos/`.

- Las reservas sin pago vencen solas al abrir la bandeja o Pedidos. Para que también venzan sin que nadie abra el sistema, programe un cron que llame `POST /api/tareas/vencer-reservas` con el encabezado `Authorization: Bearer <TAREAS_SECRET>` (defina `TAREAS_SECRET` en `.env`; sin ella la ruta no existe).
- Quién verifica pagos: los admin siempre; un agente solo si se lo activan en **Ajustes → Usuarios**.
- En el simulador, el botón «Enviar comprobante de ejemplo» manda al «cliente» una imagen para probar el flujo completo.

## Equipo: asignación, visibilidad y disponibilidad

Se configura en **Ajustes → Equipo** (solo admin): modo de asignación **Automática** (de fábrica) o **Manual**, y «Los asesores ven solo sus conversaciones» (activo de fábrica). El código está en `lib/equipo/` y `lib/visibilidad.ts`.

- **Disponibilidad:** al iniciar sesión el asesor queda *Disponible*; puede *Pausar* (con motivo opcional) y *Activarse*; al cerrar sesión queda *Desconectado*. La aplicación abierta envía una señal cada 10 s; sin señal por 5 minutos pasa a *Desconectado*. A los 15 minutos en pausa aparece el aviso para volver (y se repite cada 15).
- **Reparto:** primero al asesor responsable del cliente si está disponible; si no, al disponible con menos conversaciones abiertas (empate: quien lleva más tiempo sin recibir). Sin nadie disponible quedan en «Sin asignar» y se reparten, de la más antigua a la más nueva, cuando alguien vuelve. Todo cambio deja una línea en la conversación.
- **Visibilidad:** con el ajuste activo, el asesor solo ve (y solo puede abrir, buscar o contar) lo suyo; lo ajeno responde 404. El admin ve todo y filtra por asesor.
- **Reasignar y devolver:** solo el admin reasigna; el asesor puede «Devolver a la cola» y no vuelve a recibir esa conversación en el reparto. Con más de 30 min en pausa o desconectado, el admin puede «Repartir sus conversaciones».
- **Desconexión sin que nadie abra el sistema:** además de revisarse al usar la aplicación, programe un cron que llame cada minuto `POST /api/tareas/desconectar-asesores` con `Authorization: Bearer <TAREAS_SECRET>` (misma variable que el cron de reservas).
- **Demostración:** `npm run seed` crea tres asesores (Carlos Disponible, Mónica en pausa, Luis desconectado) con conversaciones repartidas y algunas sin asignar. Las contraseñas se muestran solo la primera vez que se crean. Un reseed borra los datos de demostración.
- Las pruebas del equipo dejan Desconectados y desactivados a los asesores de demostración mientras corren y los restauran al terminar: no las corra a la vez que otras (`npm test` ya las corre en serie).

## Estructura

| Carpeta | Qué hay |
|---|---|
| `app/(app)/` | Bandeja, contactos, catálogo, reportes, ajustes, simulador y guía de estilo |
| `components/ui/` | Componentes del sistema de diseño de Home Outlet, incluidas las gráficas |
| `lib/canales/` | Interfaz de canales, adaptador simulado, WhatsApp preparado y regla de las 24 horas |
| `lib/ia/` | Proveedor de IA (simulado y Anthropic), herramientas, reglas, atención y ayudas del agente |
| `lib/pedidos/` | Pedidos: estados, existencias, totales, pagos, avisos al cliente, vencimiento |
| `lib/` | Servicios: mensajería, bandeja, contactos, catálogo, ajustes, reportes, permisos |
| `prisma/` | Esquema, migraciones, semilla y datos de demostración |
| `ai/eval/` | Casos de evaluación del asistente y sus resultados |
| `tests/` | Pruebas automáticas |

## Para conectar WhatsApp

El adaptador (`lib/canales/whatsapp.ts`) está **terminado y probado con respuestas simuladas de Meta** (`tests/whatsapp.test.ts`); falta probarlo contra Meta de verdad. Envía texto, imágenes y tarjetas de producto (imagen con nombre, precio y existencia); recibe texto e imágenes y los estados de entrega; lo demás (audio, video, documentos, stickers, reacciones) llega como «Mensaje no compatible». Las fotos del sistema se suben a WhatsApp y se mandan por id, así que **no** hace falta una dirección pública para ellas.

Pasos (se pueden probar con el número de prueba gratuito que Meta da al crear la app):
1. En Meta for Developers cree una app con el caso de uso «Conectarte con los clientes a través de WhatsApp». En **WhatsApp → Configuración de la API** están el *Phone Number ID* y un token temporal (24 h); agregue su celular como destinatario.
2. Complete en `.env` `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` (Configuración de la app → Básica) y `WHATSAPP_VERIFY_TOKEN` (inventado), ponga `CHANNELS_ENABLED=simulado,whatsapp` y reinicie el servidor.
3. Para **recibir** mensajes, Meta necesita una dirección pública con HTTPS (un túnel temporal en desarrollo, o el servidor en producción). En **WhatsApp → Configuración → Webhook** ponga `https://<dirección>/api/webhooks/whatsapp`, el mismo `WHATSAPP_VERIFY_TOKEN`, y suscríbase al campo `messages`.
   **Importante:** además hay que suscribir la app a la cuenta de WhatsApp, o Meta no entrega los mensajes aunque el webhook verifique bien: `POST https://graph.facebook.com/v25.0/<ID de la cuenta de WhatsApp>/subscribed_apps` con el token (`GET` a la misma ruta muestra qué apps están suscritas). Con la app sin publicar, los mensajes llegan desde el número de prueba y de los destinatarios verificados.
4. Para que no venza cada 24 h, genere un token permanente (usuario del sistema en Meta Business).

**Plantillas:** fuera de las 24 horas desde el último mensaje del cliente solo se pueden enviar plantillas aprobadas por Meta. Con la ventana cerrada, el compositor muestra el aviso con el botón **Enviar plantilla** (también está en la barra de iconos): se elige una de las aprobadas de la cuenta, se llenan sus variables y se ve el mensaje tal como lo recibirá el cliente. Hace falta `WHATSAPP_BUSINESS_ACCOUNT_ID` en `.env` (el «Identificador de la cuenta de mensajes» de la Configuración de la API; sin él no hay plantillas). El sistema solo ofrece las que sabe llenar: variables numeradas en el cuerpo, encabezado de solo texto y botones sin variables (no carruseles, medios, códigos de autenticación ni variables con nombre). Las plantillas se crean y aprueban en WhatsApp Manager; la lista se guarda un minuto. En el canal simulado hay dos de ejemplo para probar la ventana sin Meta.

## Antes de publicar

- `AUTH_SECRET` y la clave de la base deben ser distintas a las de desarrollo.
- Las fotos de productos, las imágenes de la bandeja y los comprobantes de pago se guardan en `uploads/`: en el servidor esa carpeta debe estar en un disco que no se borre, o se cambia `lib/almacenamiento.ts` por un servicio de archivos.
- Defina `TAREAS_SECRET` y programe los crons de vencimiento de reservas (ver «Pedidos y pagos») y de desconexión de asesores (ver «Equipo»).
- El límite de intentos de inicio de sesión está en memoria: sirve para un solo servidor.
- El asistente responde después de contestar al webhook, dentro del mismo proceso (`after`): sirve para un servidor propio. En una plataforma sin procesos de larga vida habría que moverlo a una cola.
