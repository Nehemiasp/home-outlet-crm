-- AlterTable
ALTER TABLE "User" ADD COLUMN     "respaldoHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpPendiente" TEXT,
ADD COLUMN     "totpSecreto" TEXT,
ADD COLUMN     "totpUltimoPaso" INTEGER NOT NULL DEFAULT 0;
