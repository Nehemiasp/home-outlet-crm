# Home Outlet CRM — Guía de despliegue

Cómo publicar el sistema en un servidor. **No se ha publicado nada**: esto es la receta para cuando el cliente autorice y estén listos los accesos (ver `HOJA-DE-ENTREGA-CLIENTE.md`).

## 1. Qué se publica

Una sola aplicación (Next.js) en un solo contenedor. Dentro del mismo proceso corren el sitio, las tareas programadas (desconectar asesores inactivos cada minuto, vencer reservas cada 5 minutos) y, si se activa, el respaldo diario. Fuera del contenedor solo hacen falta:

- una **base de datos PostgreSQL** (se recomienda la versión 18, la misma con la que se probó),
- un **volumen persistente** donde se guardan las fotos, los comprobantes de pago y los respaldos,
- una **dirección web con HTTPS** (la da el hosting o un dominio propio).

> **Qué se probó y qué no.** El `Dockerfile` **no se ha construido** (el equipo de desarrollo no tiene Docker): cada comando que contiene se verificó por separado (`npm ci`, `prisma generate` sin base de datos, `npm run build`, `prisma migrate deploy` desde una base vacía, arranque en producción), pero la primera construcción real puede pedir algún ajuste menor. La revisión automática de GitHub (`.github/workflows/ci.yml`) tampoco se ha corrido en GitHub; su equivalente se corrió en local sobre una base nueva y todo pasó.

## 2. En Railway (recomendado)

1. **Subir el código a GitHub** (un repositorio privado) y crear un proyecto en Railway desde ese repositorio. Railway detecta el `Dockerfile` solo.
2. **Agregar PostgreSQL** al proyecto (servicio «PostgreSQL»). Anote su versión: si no es la 18, construya con `--build-arg PG_VERSION=<versión>` (en Railway: variable `PG_VERSION` en el servicio), porque `pg_dump` debe ser de la misma versión o más nueva que la base.
3. **Agregar un volumen** al servicio de la aplicación, montado en `/data`.
4. **Variables** del servicio de la aplicación (sección 4).
5. **Revisión de salud:** ruta `/api/salud`.
6. **Dominio:** en *Settings → Networking* generar el dominio de Railway o agregar el propio (y crear el registro DNS que indica). Con eso ya hay HTTPS.
7. **Primer administrador** (la semilla no corre en producción): abrir una terminal del servicio y ejecutar

   ```bash
   npm run admin:crear -- --nombre "Nombre Apellido" --correo persona@empresa.com
   ```

   Imprime una contraseña temporal una sola vez. Con esa persona se entra y el resto del equipo se crea desde **Ajustes → Usuarios**.
8. Abrir el sitio, entrar y seguir **Ajustes → Primeros pasos**.

## 3. En un servidor propio (Docker)

```bash
docker build -t home-outlet-crm .
docker run -d --name crm -p 3000:3000 --env-file .env.produccion -v crm-datos:/data --restart unless-stopped home-outlet-crm
```

Delante hace falta un proxy con HTTPS (Nginx, Caddy, Traefik) y `PROXIES_CONFIABLES=1`. La base de datos puede ser otra máquina o un contenedor `postgres:18` aparte.

## 4. Variables de entorno

Plantilla completa y comentada en `.env.example`. En producción:

| Variable | Qué es | Obligatoria |
|---|---|---|
| `DATABASE_URL` | Dirección de la base. **No** puede usar la clave `postgres:postgres` | **Sí** |
| `AUTH_SECRET` | Secreto de las sesiones: 32 caracteres o más, propio (`npx auth secret`) | **Sí** |
| `AUTH_URL` | La dirección pública (`https://crm.ejemplo.com`), o `AUTH_TRUST_HOST=true` | **Sí** detrás de un proxy |
| `PROXIES_CONFIABLES` | Cuántos proxies hay delante (normalmente `1`). Sin esto el login se limita solo por correo, no por IP | Recomendada |
| `UPLOADS_DIR` | `/data/uploads` (ya viene en el `Dockerfile`) | **Sí**, apuntando al volumen |
| `RESPALDO_AUTOMATICO` | `1` para el respaldo diario a las 2:00 (Guatemala) | Recomendada |
| `RESPALDOS_CARPETA` | `/data/respaldos` (ya viene en el `Dockerfile`) | Con el respaldo |
| `CHANNELS_ENABLED` | Canales activos, sin `simulado` en producción: `whatsapp,facebook,instagram,tiktok` | Con canales |
| `WHATSAPP_*`, `FACEBOOK_*`, `INSTAGRAM_*` | Credenciales de Meta (ver `.env.example`) | Con cada canal |
| `TIKTOK_ACCESS_TOKEN`, `TIKTOK_BUSINESS_ID`, `TIKTOK_APP_SECRET` | Credenciales de TikTok (ver `.env.example`). El webhook público es `/api/webhooks/tiktok`. **No poner `TIKTOK_API_URL`**: es solo para la API simulada de desarrollo y el servidor se niega a arrancar con ella | Con TikTok |
| `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_MONTHLY_BUDGET_USD` | La IA real y su tope mensual | Con la IA |

Al arrancar en producción, el servidor **revisa esto y se niega a iniciar** si hay un secreto débil, la clave de base de desarrollo o un canal a medias; y avisa en el registro de lo que quede sin configurar.

## 5. Tareas programadas

Ya corren dentro del servidor y son seguras con varias copias (cada tarea toma un candado en la base). **No hace falta un cron aparte.** Si de todos modos se prefiere uno externo, las rutas siguen existiendo: `POST /api/tareas/vencer-reservas` y `POST /api/tareas/desconectar-asesores` con `Authorization: Bearer <TAREAS_SECRET>` (sin `TAREAS_SECRET` esas rutas no existen).

## 6. Respaldos

Con `RESPALDO_AUTOMATICO=1`, cada noche a las 2:00 de Guatemala se guarda en `/data/respaldos` la base (`base.dump`) y las fotos y comprobantes (`uploads.tar.gz`), y se conservan los últimos 14. También se puede correr a mano: `npm run respaldo`.

> **Ojo: están en el mismo volumen que los datos.** Protegen de un borrado por error, no de perder el volumen. Hay que **sacar copias fuera** (descargar la carpeta cada semana, o copiarla a un almacenamiento externo) y, si el hosting ofrece respaldos propios de la base de datos, activarlos también.

**Restaurar** (probado con una base vacía): en una base nueva,

```bash
npm run restaurar -- /data/respaldos/AAAA-MM-DD_HHMMSS --a postgresql://usuario:clave@host:5432/base --confirmar --uploads /data/uploads
```

Para reemplazar la base en uso hace falta además `--sobre-la-actual`. Siempre conviene restaurar primero en una base vacía y revisarla.

## 7. Actualizar y volver atrás

- **Actualizar:** subir los cambios a GitHub; Railway construye y publica. Las migraciones de base se aplican solas al arrancar.
- **Volver atrás:** en Railway, *Deployments → Redeploy* de una versión anterior. Las migraciones son aditivas; si una versión nueva cambió el esquema, **restaure primero el respaldo de antes de actualizar** si necesita regresar de verdad.
- Antes de cada actualización importante: correr `npm run respaldo`.

## 8. Antes de abrir el sistema a los usuarios

- [ ] Variables de la sección 4 puestas y el servidor arranca sin errores de configuración
- [ ] `https://<dirección>/api/salud` responde `{"ok":true}`
- [ ] Primer administrador creado; contraseña temporal entregada por canal privado
- [ ] Ajustes → Primeros pasos completos (negocio, horario, cuentas, envíos, catálogo, equipo)
- [ ] Un respaldo hecho a mano y **una restauración de prueba** en una base vacía
- [ ] Copia de los respaldos fuera del servidor
- [ ] Canales conectados uno por uno, con un mensaje de prueba real cada uno (ver `.env.example` y la hoja de entrega)
- [ ] Una prueba completa: mensaje entrante → pedido → comprobante → verificación
- [ ] El simulador no aparece (solo existe fuera de producción) y el canal «Simulado» no está activo

## 9. Si algo falla

- **El servidor no arranca:** leer el registro; la primera línea dice qué variable falta o es débil.
- **No se puede entrar (error de sesión):** revisar `AUTH_URL` / `AUTH_TRUST_HOST`.
- **«Demasiados intentos» al entrar:** esperar 15 minutos; o, con acceso a la base, `DELETE FROM "IntentoTasa"`.
- **Las fotos desaparecen al reiniciar:** `UPLOADS_DIR` no apunta al volumen.
- **El respaldo falla con «server version mismatch»:** la versión de `pg_dump` es menor que la de la base; reconstruir con `PG_VERSION` correcto.
- **Un canal no recibe mensajes:** ver `ESTADO-ACTUAL.md` (WhatsApp necesita, además del webhook, suscribir la app a la cuenta).
