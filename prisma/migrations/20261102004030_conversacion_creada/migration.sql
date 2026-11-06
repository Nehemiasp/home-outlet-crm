-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "creada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Conversation_creada_idx" ON "Conversation"("creada");

-- Las conversaciones que ya existian se crearon con su primer mensaje.
UPDATE "Conversation" c SET "creada" = COALESCE((SELECT MIN(m."fecha") FROM "Message" m WHERE m."conversacionId" = c."id"), c."lastMessageAt");
