-- AlterTable
ALTER TABLE "AjustesPedidos" ALTER COLUMN "envioGratisDesde" SET DEFAULT 20000;

-- Home Outlet (9-nov-2026): con depósito, transferencia o tarjeta el envío es gratis desde Q200; por debajo cuesta lo mismo que contra entrega.
UPDATE "AjustesPedidos" SET "envioGratisDesde" = 20000 WHERE "envioGratisDesde" IS NULL;
