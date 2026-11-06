-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('borrador', 'pendiente_pago', 'en_revision', 'pagado', 'preparando', 'listo_para_recoger', 'enviado', 'entregado', 'cancelado', 'vencido');

-- CreateEnum
CREATE TYPE "Entrega" AS ENUM ('recoger', 'envio');

-- CreateEnum
CREATE TYPE "TipoPago" AS ENUM ('transferencia', 'deposito', 'efectivo_en_tienda', 'tarjeta');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('en_revision', 'verificado', 'rechazado');

-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('monetaria', 'ahorro');

-- CreateEnum
CREATE TYPE "ModoInventario" AS ENUM ('separado', 'compartido');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "pedidoId" TEXT;

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "apartado" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "puedeVerificarPagos" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "contactoId" TEXT NOT NULL,
    "conversacionId" TEXT,
    "canal" "Canal" NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'borrador',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "descuentoMonto" INTEGER NOT NULL DEFAULT 0,
    "descuentoMotivo" TEXT,
    "costoEnvio" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "entrega" "Entrega" NOT NULL DEFAULT 'recoger',
    "direccion" TEXT,
    "municipio" TEXT,
    "zona" TEXT,
    "guia" TEXT,
    "notas" TEXT,
    "creadoPorId" TEXT,
    "reservadoHasta" TIMESTAMP(3),
    "sobrePedido" BOOLEAN NOT NULL DEFAULT false,
    "creada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "productoId" TEXT,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "ubicacionId" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "tipo" "TipoPago" NOT NULL,
    "banco" TEXT,
    "referencia" TEXT,
    "monto" INTEGER NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL,
    "mensajeId" TEXT,
    "archivoUrl" TEXT,
    "estado" "EstadoPago" NOT NULL DEFAULT 'en_revision',
    "verificadoPorId" TEXT,
    "verificadoEn" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "registradoPorId" TEXT,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "deEstado" "EstadoPedido",
    "aEstado" "EstadoPedido" NOT NULL,
    "usuarioId" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'usuario',
    "nota" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "tipo" "TipoCuenta" NOT NULL DEFAULT 'monetaria',
    "numero" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "municipios" TEXT[],
    "costo" INTEGER NOT NULL,
    "tiempo" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjustesPedidos" (
    "id" TEXT NOT NULL DEFAULT 'pedidos',
    "prefijo" TEXT NOT NULL DEFAULT 'HO-',
    "siguienteNumero" INTEGER NOT NULL DEFAULT 1,
    "horasReserva" INTEGER NOT NULL DEFAULT 24,
    "descuentoMaxAgente" INTEGER NOT NULL DEFAULT 0,
    "inventario" "ModoInventario" NOT NULL DEFAULT 'separado',
    "metodos" "TipoPago"[] DEFAULT ARRAY['transferencia', 'deposito']::"TipoPago"[],
    "envioGratisDesde" INTEGER,
    "ubicacionRecogerId" TEXT,
    "ubicacionEnvioId" TEXT,

    CONSTRAINT "AjustesPedidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_codigo_key" ON "Order"("codigo");

-- CreateIndex
CREATE INDEX "Order_estado_creada_idx" ON "Order"("estado", "creada");

-- CreateIndex
CREATE INDEX "Order_contactoId_idx" ON "Order"("contactoId");

-- CreateIndex
CREATE INDEX "Order_conversacionId_idx" ON "Order"("conversacionId");

-- CreateIndex
CREATE INDEX "Order_estado_reservadoHasta_idx" ON "Order"("estado", "reservadoHasta");

-- CreateIndex
CREATE INDEX "OrderItem_pedidoId_idx" ON "OrderItem"("pedidoId");

-- CreateIndex
CREATE INDEX "OrderItem_productoId_idx" ON "OrderItem"("productoId");

-- CreateIndex
CREATE INDEX "Payment_pedidoId_idx" ON "Payment"("pedidoId");

-- CreateIndex
CREATE INDEX "Payment_estado_idx" ON "Payment"("estado");

-- CreateIndex
CREATE INDEX "Payment_banco_referencia_idx" ON "Payment"("banco", "referencia");

-- CreateIndex
CREATE INDEX "OrderEvent_pedidoId_fecha_idx" ON "OrderEvent"("pedidoId", "fecha");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_contactoId_fkey" FOREIGN KEY ("contactoId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_mensajeId_fkey" FOREIGN KEY ("mensajeId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verificadoPorId_fkey" FOREIGN KEY ("verificadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjustesPedidos" ADD CONSTRAINT "AjustesPedidos_ubicacionRecogerId_fkey" FOREIGN KEY ("ubicacionRecogerId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjustesPedidos" ADD CONSTRAINT "AjustesPedidos_ubicacionEnvioId_fkey" FOREIGN KEY ("ubicacionEnvioId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reglas que la base misma hace cumplir. No se limita cantidad − apartado: un admin puede dejar un pedido "sobre pedido".
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_apartado_no_negativo" CHECK ("apartado" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_montos_no_negativos" CHECK ("subtotal" >= 0 AND "descuentoMonto" >= 0 AND "costoEnvio" >= 0 AND "total" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_cantidad_positiva" CHECK ("cantidad" > 0 AND "precio" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_monto_positivo" CHECK ("monto" > 0);
