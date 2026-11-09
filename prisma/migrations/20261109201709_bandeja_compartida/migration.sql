-- AlterEnum
-- (El valor nuevo no se puede usar en la misma transacción que lo crea: el valor de fábrica va en la migración siguiente.)
ALTER TYPE "ModoAsignacion" ADD VALUE 'compartida';

-- CreateTable
CREATE TABLE "ParticipanteConversacion" (
    "conversacionId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipanteConversacion_pkey" PRIMARY KEY ("conversacionId","usuarioId")
);

-- CreateIndex
CREATE INDEX "ParticipanteConversacion_usuarioId_idx" ON "ParticipanteConversacion"("usuarioId");

-- AddForeignKey
ALTER TABLE "ParticipanteConversacion" ADD CONSTRAINT "ParticipanteConversacion_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipanteConversacion" ADD CONSTRAINT "ParticipanteConversacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Quien ya tenía una conversación asignada pasa a ser su participante principal.
INSERT INTO "ParticipanteConversacion" ("conversacionId", "usuarioId", "desde")
SELECT "id", "asignadaAId", "lastMessageAt" FROM "Conversation" WHERE "asignadaAId" IS NOT NULL;
