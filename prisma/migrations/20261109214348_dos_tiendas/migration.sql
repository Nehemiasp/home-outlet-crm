-- AlterTable
ALTER TABLE "Cotizacion" ADD COLUMN     "recogerEnId" TEXT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "direccion" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "recogerEnId" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_recogerEnId_fkey" FOREIGN KEY ("recogerEnId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_recogerEnId_fkey" FOREIGN KEY ("recogerEnId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Las dos tiendas reales (9-nov-2026): la «física» es la de Puerto Barrios y la «en línea» pasa a ser la de Mixco.
UPDATE "Location" SET "nombre" = 'Tienda Puerto Barrios', "direccion" = '7a. avenida y 10a. calle, zona 1, Puerto Barrios, Izabal, frente al parque. Hay parqueo.' WHERE "nombre" = 'Tienda física';
UPDATE "Location" SET "nombre" = 'Tienda Mixco', "direccion" = '4 calle 11-47 zona 2 de Mixco, colonia Santa Mónica, Guatemala' WHERE "nombre" = 'Tienda en línea';
