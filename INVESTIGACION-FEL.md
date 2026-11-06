# Factura electrónica (FEL) en Guatemala — investigación para Home Outlet CRM

> **Aviso.** Esto es una investigación técnica y de producto, **no asesoría fiscal**. Las obligaciones de facturación las debe confirmar el contador del negocio. Intenté leer el portal de la SAT directamente y respondió con acceso denegado, así que lo que sigue combina lo que se alcanzó a ver de la SAT en buscadores con **fuentes secundarias (blogs y conectores de terceros)**, que conviene verificar.

## 1. Estado actual del sistema

El CRM **no maneja facturas**: no guarda NIT del cliente, IVA, serie ni número de factura. Los precios se guardan en centavos y el pedido tiene subtotal, descuento, envío y total, sin desglose de impuestos. Hoy el negocio factura por fuera.

## 2. Cómo funciona la factura electrónica (lo que se pudo confirmar)

- Se llama **FEL (Factura Electrónica en Línea)** y el documento es el **DTE** (Documento Tributario Electrónico). Está regulado por el Régimen FEL de la SAT (Acuerdo de Directorio 13-2018 y sus reformas).
- Según fuentes secundarias, cada DTE lleva la firma del emisor y la del certificador, un **UUID** asignado por la SAT y un **código QR** de validación pública, con una estructura XML definida por la SAT.
- Hay **dos vías de emisión** (según las preguntas frecuentes de la SAT):
  1. **Gratuita**: por la **Agencia Virtual** de la SAT o la **App FEL**, donde la SAT misma actúa de certificador.
  2. **Con un certificador autorizado**: es de pago y es la que permite **integrar con un sistema** (por API).
- La SAT publica la **lista oficial de certificadores** autorizados, con fechas de autorización y renovación (se renuevan cada año), así que hay que revisar que el elegido esté vigente.

## 3. Certificadores

Los más mencionados como populares: **Infile, Megaprint, Digifact y Guatefacturas** (también Superfactura). Costos de referencia, **solo mensuales y de blogs de terceros** (sin cifras por documento): Infile ~Q150 al mes, Megaprint ~Q100, Superfactura ~Q100, con un rango general de Q50 a más de Q500 según volumen y funciones. **Hay que pedir cotización a cada uno.**

Sobre la integración:
- Infile aparece con soporte de API; existen **SDK de la comunidad** (no oficiales) para Digifact en Python, JavaScript, PHP y .NET.
- Un conector de Odoo muestra el esquema típico de Megaprint: NIT y contraseña para obtener un token, y de ahí se envían los documentos.
- No pude revisar la documentación oficial de ninguno (hay que pedirla al elegir).

## 4. Qué habría que hacer en el CRM

Tres opciones, de menos a más trabajo:

### A. No integrar (la más simple)
El negocio sigue facturando por fuera (App FEL o su sistema). El CRM solo agrega un campo **«Factura No.»** al pedido (texto libre) para que quede la referencia. Casi no hay trabajo; no automatiza nada.

### B. Datos listos para copiar
Un botón **«Copiar datos para factura»** en el pedido: NIT y nombre del cliente, líneas con cantidad, descripción y precio, y totales con el IVA desglosado, para pegar en la App FEL. Requiere agregar el **NIT** al contacto y definir cómo se calcula el IVA. Trabajo corto.

### C. Emisión automática con un certificador (la más completa)
Al confirmarse el pago (o al entregar), el sistema emite el DTE por API y guarda **UUID, serie, número y enlace al PDF**. Hay que resolver:
- **Datos del cliente**: NIT o CUI (o «CF», consumidor final) y dirección, en el contacto y en el pedido.
- **IVA (12 %)**: saber si los precios del catálogo **ya lo incluyen** (lo habitual en venta al público) y desglosarlo en el DTE.
- **Anulaciones y notas de crédito**: qué pasa al cancelar un pedido ya facturado o al devolver mercadería. Es la parte más delicada.
- **Fallas del certificador**: el pedido no debe quedar a medias si el servicio no responde (reintentos y estado «factura pendiente»).
- **Descuento y envío**: cómo se muestran en la factura.
- **Quién emite**: la empresa como emisor habilitado en la SAT, con el certificador contratado.
- **Pruebas**: el certificador debe tener ambiente de pruebas; hace falta una cuenta para desarrollarlo.

Estimación de esfuerzo (a juicio, sin cuenta de certificador): A, un día; B, unos días; C, entre una y dos semanas más la revisión del contador, sobre todo por anulaciones y notas de crédito.

## 5. Recomendación

1. **Preguntar al cliente cómo factura hoy** y con qué certificador (si ya tiene uno, se usa ese).
2. Si las ventas por el CRM son pocas, empezar por **la opción A o B**: cubren el control sin riesgo fiscal.
3. Pasar a **C** cuando el volumen lo justifique y con el contador involucrado desde el diseño.

## 6. Preguntas para el cliente y su contador

- ¿Cómo emiten hoy sus facturas y con qué certificador o sistema?
- ¿Las ventas por mensajería (WhatsApp, Facebook, Instagram) deben facturarse al momento de pagar o al entregar?
- ¿Los precios del catálogo incluyen IVA?
- ¿Hay clientes que piden factura con NIT y otros con «CF»?
- ¿Cómo manejan devoluciones y anulaciones?
- ¿Pagan ya un plan con un certificador? ¿Cuál?

## Fuentes consultadas

- [Portal SAT: Certificadores de DTE](https://portal.sat.gob.gt/portal/certificador-de-dte/) y [Preguntas frecuentes de cumplimiento tributario](https://portal.sat.gob.gt/portal/preguntas-frecuentes/cumplimiento-tributario/) (apareció en la búsqueda, pero respondió con acceso denegado al abrirlo)
- [Prensa Libre: la SAT habilita más certificadores](https://www.prensalibre.com/economia/habilitan-primer-certificador-e-inscripcion-de-grandes-contribuyentes-en-el-regimen-de-factura-electronica-en-linea/)
- [Régimen FEL (INEDICOM, PDF)](https://www.indrese.com/downloads/inEDICOMfelGuatemala.pdf)
- [Comparación de proveedores FEL (livinginguatemala.com)](https://livinginguatemala.com/es/formar-empresa/fel-providers-comparacion/) y [habilitación FEL](https://livinginguatemala.com/tramites/sat-fel-habilitacion/)
- [SDK de Digifact (packagist, no oficial)](https://packagist.org/packages/aalonzolu/digifact) y [conector de Megaprint para Odoo](https://apps.odoo.com/apps/modules/16.0/account_invoice_megaprint)
- [Acuerdo de Directorio 15-2020: reformas al Régimen FEL (vLex)](https://gt.vlex.com/vid/acuerdo-directorio-no-15-913390202)
