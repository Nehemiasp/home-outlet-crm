-- AlterTable
ALTER TABLE "AjustesPedidos" ADD COLUMN     "paqueterias" TEXT[] DEFAULT ARRAY['Forza', 'Cargo Expreso', 'Guatex']::TEXT[];

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "guiaArchivoNombre" TEXT,
ADD COLUMN     "guiaArchivoUrl" TEXT,
ADD COLUMN     "paqueteria" TEXT;
