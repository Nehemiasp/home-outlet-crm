-- CreateEnum
CREATE TYPE "EstadoCobro" AS ENUM ('creado', 'pagado', 'fallido');

-- CreateTable
CREATE TABLE "CobroTarjeta" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "pasarela" TEXT NOT NULL,
    "externoId" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "estado" "EstadoCobro" NOT NULL DEFAULT 'creado',
    "url" TEXT NOT NULL,
    "creadoPorId" TEXT,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltoEn" TIMESTAMP(3),

    CONSTRAINT "CobroTarjeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CobroTarjeta_externoId_key" ON "CobroTarjeta"("externoId");

-- CreateIndex
CREATE INDEX "CobroTarjeta_pedidoId_idx" ON "CobroTarjeta"("pedidoId");

-- AddForeignKey
ALTER TABLE "CobroTarjeta" ADD CONSTRAINT "CobroTarjeta_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
