-- CreateTable
CREATE TABLE "Negocio" (
    "id" TEXT NOT NULL DEFAULT 'negocio',
    "nombre" TEXT NOT NULL DEFAULT 'Home Outlet Internacional',
    "horario" TEXT,
    "direccion" TEXT,

    CONSTRAINT "Negocio_pkey" PRIMARY KEY ("id")
);
