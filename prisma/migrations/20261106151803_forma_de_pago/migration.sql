-- AlterEnum
ALTER TYPE "EstadoCobro" ADD VALUE 'cancelado';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "metodoPago" "TipoPago";
