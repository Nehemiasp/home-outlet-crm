-- AlterEnum
ALTER TYPE "TipoPago" ADD VALUE 'contra_entrega';

-- AlterTable
ALTER TABLE "AjustesPedidos" ADD COLUMN     "costoContraEntrega" INTEGER NOT NULL DEFAULT 3500,
ADD COLUMN     "envioGratisSinContraEntrega" BOOLEAN NOT NULL DEFAULT true;
