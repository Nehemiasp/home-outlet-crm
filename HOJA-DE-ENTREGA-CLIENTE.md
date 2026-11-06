# Home Outlet CRM — Hoja de entrega: lo que necesitamos de ustedes

**Para:** Home Outlet Internacional, S.A.
**De:** [su nombre y contacto]
**Fecha:** [fecha de envío]

El sistema ya está construido y aprobado. Con los datos de demostración funciona completo: bandeja de mensajes, contactos, catálogo, pedidos y pagos, equipo de asesores, reportes y asistente con inteligencia artificial.

Para que pase de demostración a **funcionar con clientes reales** nos faltan cosas que solo ustedes pueden dar: **datos del negocio, decisiones y accesos**. Este documento lista cada una, explica **para qué sirve** y **cómo conseguirla**. Todo se puede ir entregando por partes: lo marcado como **Prioridad 1** es lo que más tarda, así que conviene empezar por ahí.

> **Importante sobre seguridad.** Nunca nos envíen contraseñas por WhatsApp, correo o mensaje. Donde haga falta un acceso, lo correcto es **agregar a una persona de nuestro equipo con el rol que se indica** (así ustedes conservan el control y pueden quitarlo cuando quieran). Las claves técnicas (tokens) se entregan por un canal privado que acordaremos.

---

## 1. Resumen: la lista completa

| # | Qué | Quién lo entrega | Prioridad |
|---|---|---|---|
| A | Verificación de la empresa en Meta (Facebook) | Representante legal / administrador | **1 — tarda días o semanas** |
| B | Número de WhatsApp para el negocio | Administrador | **1** |
| C | Página de Facebook y cuenta de Instagram del negocio | Quien las administra | **1** |
| D | Decisiones del negocio (sección 4) | Gerencia | **1** |
| E | Datos del negocio: horario, dirección, cuentas bancarias, envíos | Administración | 2 |
| F | Catálogo: productos, precios, fotos y existencias | Quien lleva el inventario | 2 |
| G | Equipo: quiénes usarán el sistema y con qué rol | Gerencia | 2 |
| H | Preguntas frecuentes y forma de hablar del negocio | Atención al cliente | 2 |
| I | Cuenta de Anthropic (la IA) y presupuesto mensual | Administrador | 2 |
| J | Dónde se publica el sistema: servidor, dominio y correo | Administrador | 2 |
| K | Logo en alta calidad | Quien lo tenga | 3 |
| L | Pago con tarjeta: ¿sí o no, y con qué banco o proveedor? | Gerencia | 3 (decisión) |
| M | Factura electrónica (FEL): ¿debe el sistema emitirla? | Contador / gerencia | 3 (decisión) |

---

## 2. Accesos (Prioridad 1)

### A. Verificación de la empresa en Meta

**Para qué sirve:** sin ella, WhatsApp, Facebook e Instagram quedan limitados (pocos mensajes, sin plantillas aprobadas, sin número propio). Es el trámite más lento y no depende de nosotros.

**Cómo se hace:**
1. Entrar a **business.facebook.com** con la cuenta de Facebook de la persona que representa a la empresa. Si la empresa **ya tiene** una cuenta de Meta Business, usar esa; si no, crearla con el nombre legal de la empresa.
2. En **Configuración del negocio → Centro de seguridad → Verificación de la empresa**, iniciar la verificación.
3. Meta pide, aproximadamente: nombre legal de la empresa, dirección, teléfono, sitio web o dominio, y **documentos que prueben que la empresa existe** (por ejemplo, patente de comercio, RTU/NIT, o un recibo de servicios a nombre de la empresa). Los requisitos exactos los define Meta y pueden variar; la pantalla muestra cuáles aceptan.
4. Esperar la respuesta de Meta. Puede tardar desde unos días hasta semanas.

**Qué necesitamos de ustedes:** que la verificación quede **iniciada** y, cuando termine, **agregar a nuestra persona como administrador de la cuenta de Meta Business** (Configuración del negocio → Usuarios → Personas → Agregar). Nuestro correo: `[correo del desarrollador]`.

### B. Número de WhatsApp del negocio

**Para qué sirve:** es el número desde el que el sistema le escribirá a los clientes y en el que ellos le escribirán.

**Requisitos del número:**
- Que **no esté en uso en WhatsApp personal** (si lo está, hay que borrarle esa cuenta de WhatsApp antes de usarlo para esto). Si hoy lo usan en la aplicación **WhatsApp Business**, avísennos antes de tocar nada: hay que decidir cómo migrarlo sin perder las conversaciones.
- Que pueda **recibir una llamada o un SMS** con un código de verificación.
- Idealmente un número **fijo del negocio** que no vaya a cambiar.

**Nombre que verán los clientes:** Meta revisa el nombre visible («Home Outlet» u otro). Debe coincidir con el nombre de la empresa o su marca conocida. Díganos cuál prefieren: `[nombre]`.

**Costo:** Meta cobra por algunos mensajes (los que la empresa inicia fuera de las 24 horas posteriores al último mensaje del cliente). Hace falta una **tarjeta de crédito o débito** asociada a la cuenta de Meta Business. La tarifa vigente la publica Meta.

### C. Página de Facebook e Instagram

**Para qué sirve:** para recibir y contestar desde la misma bandeja los mensajes directos de Facebook Messenger e Instagram.

**Requisitos:**
- Una **Página de Facebook** del negocio (no un perfil personal).
- Una cuenta de **Instagram profesional** (de empresa) **vinculada a esa Página**. Si hoy es personal, se cambia en Instagram: Configuración → Tipo de cuenta → Cambiar a cuenta profesional.
- Que la persona que administra la Página nos agregue (**Configuración de la Página → Acceso a la página → Agregar nuevo → control total**) o, mejor, que la Página esté dentro de la cuenta de Meta Business de la sección A.

**Mensaje claro sobre TikTok:** hoy el sistema **no se conecta a los mensajes de TikTok**. Si es un canal importante para ustedes, díganlo y lo evaluamos como trabajo aparte.

---

## 3. Datos del negocio (Prioridad 2)

Estos datos reemplazan los de demostración. Pueden responder en este mismo documento, en Excel o por mensaje.

### E1. Datos generales

| Dato | Respuesta |
|---|---|
| Nombre comercial | |
| Dirección de la tienda (como la diría a un cliente) | |
| Teléfono de atención | |
| Texto sobre **formas de pago** que el asistente le dirá al cliente | |
| Texto sobre **envíos** | |
| Texto sobre **garantía** | |

### E2. Horario de atención

| Día | Abre | Cierra | (o «cerrado») |
|---|---|---|---|
| Lunes | | | |
| Martes | | | |
| Miércoles | | | |
| Jueves | | | |
| Viernes | | | |
| Sábado | | | |
| Domingo | | | |

El sistema lo usa para avisar al cliente cuando escribe fuera de horario.

### E3. Cuentas bancarias para pagos por transferencia o depósito

Una fila por cuenta. Estos datos se le envían al cliente cuando se le manda el resumen de su pedido.

| Banco | Tipo (monetaria / ahorro) | Número de cuenta | Nombre del titular |
|---|---|---|---|
| | | | |
| | | | |

### E4. Zonas de envío

Una fila por zona. El sistema calcula el costo al elegir el municipio del cliente.

| Nombre de la zona | Municipios que incluye | Costo (Q) | Tiempo estimado (ej. «1 a 2 días») |
|---|---|---|---|
| | | | |
| | | | |

Indiquen también: ¿**envío gratis** a partir de qué monto? `[monto o «no hay»]`

---

## 4. Decisiones del negocio (Prioridad 1)

Son preguntas rápidas; solo hay que elegir.

1. **Inventario: ¿una sola bodega o dos?**
   - **Separado:** lo que se recoge en tienda sale de «Tienda física» y lo que se envía sale de «Tienda en línea». Cada una tiene su propia cantidad.
   - **Compartido:** todo se suma y se aparta del total.
   - Elección: `[separado / compartido]`

2. **Descuentos:** ¿cuánto puede descontar un **asesor** por su cuenta, sin autorización de un administrador? (Hoy: 0 %). Elección: `[ __ % ]`

3. **Reservas:** cuando se envía un pedido, el sistema aparta los productos hasta recibir el pago. ¿Cuántas horas? (Hoy: 24). Elección: `[ __ horas ]`

4. **Verificación de pagos:** ¿quién confirma que un depósito o transferencia llegó realmente? Solo administradores, o también ciertos asesores. Elección: `[nombres]`

5. **Efectivo en tienda:** ¿aceptan pago en efectivo al recoger? `[sí / no]`

6. **Pago con tarjeta:** ¿lo quieren en esta etapa? Si sí, ¿con qué banco o proveedor ya tienen contrato o interés? (Varias opciones requieren un contrato como comercio afiliado y cobran comisión por transacción.) Elección: `[sí / no / más adelante]` — Proveedor: `[ ]`

7. **Factura electrónica (FEL):** ¿quieren que el sistema **emita** la factura, o la seguirán emitiendo con su sistema actual? Si hay que integrarla: ¿quién es su **certificador FEL**? Elección: `[ ]`

---

## 5. Catálogo, equipo y atención

### F. Catálogo de productos

El sistema importa un archivo **CSV** (se puede guardar desde Excel con «Guardar como → CSV»). Columnas:

```
sku, nombre, categoria, precio, descripcion, existencia_tienda, existencia_linea
```

- **Obligatorias:** `sku` (código único del producto), `nombre` y `precio` (en quetzales, ej. 349.00).
- `existencia_tienda` y `existencia_linea`: cuántas unidades hay en cada lugar.
- Las **fotos** se suben después, producto por producto, en el sistema (hasta 5 MB cada una). Si prefieren, nos las envían nombradas con el SKU y las cargamos nosotros.

### G. Equipo

| Nombre | Correo | Rol (administrador / asesor) | ¿Puede verificar pagos? |
|---|---|---|---|
| | | | |
| | | | |

El **administrador** ve todo: reportes, ajustes, todos los pedidos y conversaciones. El **asesor** atiende conversaciones y pedidos; por defecto solo ve **lo que tiene asignado**. Cada persona recibe su contraseña inicial por un canal privado.

### H. Preguntas frecuentes y forma de hablar

El asistente con IA contesta primero a los clientes. Para que hable como ustedes:

- **15 a 30 preguntas frecuentes con su respuesta** (horarios, envíos, garantía, cambios, cómo apartar, formas de pago, etc.).
- **Tono:** ¿cercano o formal? ¿Tutean o tratan de «usted»? `[ ]`
- **Mensaje de bienvenida** que quieren que vea el cliente al escribir por primera vez: `[texto]`
- **Cuándo debe pasar la conversación a una persona** además de lo ya definido (compras, pagos, imágenes y reclamos siempre pasan a un asesor): `[ ]`

---

## 6. Servicios y cuentas técnicas (Prioridad 2)

### I. Cuenta de Anthropic (la inteligencia artificial)

**Para qué sirve:** es el servicio que pone a «pensar» al asistente. Se paga por uso.

**Cómo se hace:**
1. Crear una cuenta en **console.anthropic.com** con un correo de la empresa.
2. Agregar saldo o un método de pago (**Facturación**).
3. Crear una **clave de API** y entregárnosla por canal privado. Esa clave es como una contraseña: quien la tenga puede gastar el saldo.

**Presupuesto:** el sistema tiene un **tope mensual configurable**: avisa al llegar al 80 % y apaga al asistente al 100 %, para que nunca haya sorpresas. Díganos cuánto quieren gastar como máximo al mes: `[US$ ___]`

### J. Dónde vivirá el sistema

El sistema necesita un servidor en internet, una base de datos y una dirección web.

- **Servidor:** recomendamos **Railway** (sencillo, con base de datos incluida y tareas programadas). Es un servicio de pago mensual; requiere una **tarjeta** a nombre de la empresa. Si prefieren otro proveedor, lo evaluamos.
- **Dirección web (dominio):** por ejemplo `crm.homeoutlet.com.gt`. Necesitamos que nos digan **quién administra el dominio** de la empresa y que nos den acceso para crear un registro DNS. Si no tienen uno, se compra.
- **Correo de la empresa** para las cuentas y avisos: `[correo]`

El sistema **no se publica hasta que ustedes lo autoricen**.

### K. Logo

Archivo en **PNG con fondo transparente** o **SVG**, y si existe, una versión en blanco para fondos oscuros.

---

## 7. Qué pasa después

1. **Ustedes** inician A, B y C y responden las decisiones de la sección 4.
2. **Nosotros** cargamos los datos reales, conectamos cada canal en cuanto llegue su acceso y probamos con mensajes de verdad.
3. **Prueba conjunta:** una semana de uso con algunos asesores y clientes de confianza, con ajustes sobre la marcha.
4. **Publicación** en el servidor y el dominio, con respaldos diarios.

Los tiempos de Meta (verificación de la empresa, aprobación del nombre del número, plantillas de mensajes) los controla Meta y no se pueden acelerar: por eso la sección 2 es lo primero.

---

## 8. Lista de verificación final

- [ ] Verificación de empresa en Meta iniciada
- [ ] Número de WhatsApp definido (libre de WhatsApp personal)
- [ ] Página de Facebook e Instagram profesional vinculados
- [ ] Nuestra persona agregada como administradora en Meta Business
- [ ] Decisiones de la sección 4 respondidas
- [ ] Horario, dirección y textos del negocio
- [ ] Cuentas bancarias y zonas de envío
- [ ] Catálogo en CSV (y fotos)
- [ ] Lista de usuarios y roles
- [ ] Preguntas frecuentes y tono
- [ ] Cuenta de Anthropic con saldo y presupuesto
- [ ] Servidor, dominio y correo definidos
- [ ] Logo

**Cualquier duda sobre un paso, escríbannos antes de hacerlo:** `[contacto]`
