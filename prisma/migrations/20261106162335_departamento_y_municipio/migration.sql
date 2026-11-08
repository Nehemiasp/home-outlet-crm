-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "departamento" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "departamento" TEXT;

-- AlterTable
ALTER TABLE "ShippingZone" ADD COLUMN     "departamentos" TEXT[] DEFAULT ARRAY[]::TEXT[];
