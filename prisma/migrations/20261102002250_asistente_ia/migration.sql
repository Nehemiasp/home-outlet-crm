-- CreateEnum
CREATE TYPE "Autor" AS ENUM ('cliente', 'asesor', 'asistente');

-- CreateEnum
CREATE TYPE "AtendidaPor" AS ENUM ('asistente', 'asesor', 'nadie');

-- CreateEnum
CREATE TYPE "Motivo" AS ENUM ('precio', 'existencia', 'envio', 'horario', 'compra', 'reclamo', 'garantia', 'otro');

-- CreateEnum
CREATE TYPE "ModoAsistente" AS ENUM ('siempre', 'fuera_de_horario', 'sin_asesores');

-- CreateEnum
CREATE TYPE "ResultadoIa" AS ENUM ('respondio', 'paso_a_asesor', 'error');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "municipio" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "atendidaPor" "AtendidaPor" NOT NULL DEFAULT 'nadie',
ADD COLUMN     "esperandoAsesorDesde" TIMESTAMP(3),
ADD COLUMN     "motivo" "Motivo";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "aiRunId" TEXT,
ADD COLUMN     "autor" "Autor" NOT NULL DEFAULT 'cliente';

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "envios" TEXT,
ADD COLUMN     "garantia" TEXT,
ADD COLUMN     "horarioSemanal" JSONB,
ADD COLUMN     "pagos" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ultimaActividad" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL DEFAULT 'ia',
    "encendido" BOOLEAN NOT NULL DEFAULT true,
    "canales" "Canal"[] DEFAULT ARRAY['whatsapp', 'tiktok', 'instagram', 'facebook', 'simulado']::"Canal"[],
    "modo" "ModoAsistente" NOT NULL DEFAULT 'siempre',
    "bienvenida" TEXT NOT NULL DEFAULT 'Hola, soy el asistente virtual de Home Outlet. Puedo ayudarle con precios, existencias, horarios y envíos. Si prefiere hablar con un asesor, escriba *asesor*.',
    "limiteRespuestas" INTEGER NOT NULL DEFAULT 6,
    "presupuestoMensualUsd" DOUBLE PRECISION,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'general',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'respuesta',
    "proveedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL,
    "tokensSalida" INTEGER NOT NULL,
    "costoUsd" DOUBLE PRECISION NOT NULL,
    "ms" INTEGER NOT NULL,
    "herramientas" TEXT[],
    "consultado" TEXT[],
    "productos" TEXT[],
    "resultado" "ResultadoIa" NOT NULL,
    "sinRespuesta" BOOLEAN NOT NULL DEFAULT false,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSummary" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "creado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generadoPorId" TEXT,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRun_creado_idx" ON "AiRun"("creado");

-- CreateIndex
CREATE INDEX "AiRun_conversacionId_idx" ON "AiRun"("conversacionId");

-- CreateIndex
CREATE INDEX "ConversationSummary_conversacionId_creado_idx" ON "ConversationSummary"("conversacionId", "creado");

-- CreateIndex
CREATE INDEX "Conversation_atendidaPor_esperandoAsesorDesde_idx" ON "Conversation"("atendidaPor", "esperandoAsesorDesde");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSummary" ADD CONSTRAINT "ConversationSummary_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSummary" ADD CONSTRAINT "ConversationSummary_generadoPorId_fkey" FOREIGN KEY ("generadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Datos existentes: los mensajes enviados eran de asesores, y las conversaciones asignadas ya las atiende una persona.
UPDATE "Message" SET "autor" = 'asesor' WHERE "direccion" = 'saliente';
UPDATE "Conversation" SET "atendidaPor" = 'asesor' WHERE "asignadaAId" IS NOT NULL;
UPDATE "Conversation" SET "esperandoAsesorDesde" = "lastMessageAt" WHERE "asignadaAId" IS NULL AND "estado" <> 'cerrada';
