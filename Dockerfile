# Imagen de producción de Home Outlet CRM. Sirve en Railway (detecta este archivo solo), en un servidor propio o en cualquier
# lugar que corra Docker. Una sola imagen: el servidor, las tareas programadas y el respaldo diario viven en el mismo proceso.
#
#   docker build -t home-outlet-crm .
#   docker run -p 3000:3000 --env-file .env.produccion -v crm-datos:/data home-outlet-crm
#
# NO se ha construido aquí (este equipo no tiene Docker): cada paso se verificó por separado, pero la primera construcción
# real puede pedir algún ajuste. Corre como root a propósito: los volúmenes de Railway se montan con ese dueño.
FROM node:22-bookworm-slim

# Cliente de PostgreSQL para el respaldo diario. Debe ser de la misma versión que el servidor de base de datos o más nueva
# (pg_dump se niega con un servidor más nuevo que él). Cámbielo con --build-arg PG_VERSION=17 si su base es otra.
ARG PG_VERSION=18
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tar \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-${PG_VERSION} \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias primero (capa que se reutiliza mientras no cambie package-lock.json). postinstall corre «prisma generate».
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    UPLOADS_DIR=/data/uploads \
    RESPALDOS_CARPETA=/data/respaldos
EXPOSE 3000

# Las migraciones se aplican al arrancar (Prisma usa un candado en la base: varias copias a la vez no chocan) y luego sirve.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
