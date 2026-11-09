-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('enviada', 'aceptada');

-- AlterTable
ALTER TABLE "AjustesPedidos" ADD COLUMN     "diasCotizacion" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "siguienteCotizacion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cotizacionId" TEXT;

-- CreateTable
CREATE TABLE "Cotizacion" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "contactoId" TEXT NOT NULL,
    "conversacionId" TEXT,
    "canal" "Canal" NOT NULL,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'enviada',
    "subtotal" INTEGER NOT NULL,
    "descuentoMonto" INTEGER NOT NULL DEFAULT 0,
    "descuentoMotivo" TEXT,
    "costoEnvio" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "entrega" "Entrega" NOT NULL DEFAULT 'recoger',
    "direccion" TEXT,
    "municipio" TEXT,
    "departamento" TEXT,
    "zona" TEXT,
    "notas" TEXT,
    "creadoPorId" TEXT,
    "validaHasta" TIMESTAMP(3) NOT NULL,
    "creada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionLinea" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "productoId" TEXT,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "CotizacionLinea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cotizacion_codigo_key" ON "Cotizacion"("codigo");

-- CreateIndex
CREATE INDEX "Cotizacion_creada_idx" ON "Cotizacion"("creada");

-- CreateIndex
CREATE INDEX "Cotizacion_estado_validaHasta_idx" ON "Cotizacion"("estado", "validaHasta");

-- CreateIndex
CREATE INDEX "Cotizacion_contactoId_idx" ON "Cotizacion"("contactoId");

-- CreateIndex
CREATE INDEX "Cotizacion_conversacionId_idx" ON "Cotizacion"("conversacionId");

-- CreateIndex
CREATE INDEX "CotizacionLinea_cotizacionId_idx" ON "CotizacionLinea"("cotizacionId");

-- CreateIndex
CREATE INDEX "Order_cotizacionId_idx" ON "Order"("cotizacionId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_contactoId_fkey" FOREIGN KEY ("contactoId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionLinea" ADD CONSTRAINT "CotizacionLinea_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionLinea" ADD CONSTRAINT "CotizacionLinea_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
