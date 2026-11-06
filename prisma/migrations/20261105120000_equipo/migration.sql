-- CreateEnum
CREATE TYPE "EstadoAsesor" AS ENUM ('disponible', 'en_pausa', 'desconectado');

-- CreateEnum
CREATE TYPE "OrigenEstadoAsesor" AS ENUM ('manual', 'inicio_sesion', 'cierre_sesion', 'latido', 'sin_senal', 'admin');

-- CreateEnum
CREATE TYPE "ModoAsignacion" AS ENUM ('manual', 'automatica');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "asesorResponsableId" TEXT,
ADD COLUMN     "creadoPorId" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "excluirAsesorId" TEXT;

-- AlterTable
-- El último latido conserva su valor: se renombra la columna en vez de borrarla.
ALTER TABLE "User" RENAME COLUMN "ultimaActividad" TO "ultimaSenal";

ALTER TABLE "User" ADD COLUMN     "estadoAsesor" "EstadoAsesor" NOT NULL DEFAULT 'desconectado',
ADD COLUMN     "estadoDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "motivoPausa" TEXT,
ADD COLUMN     "ultimaAsignacionEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HistorialEstadoAsesor" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "estado" "EstadoAsesor" NOT NULL,
    "motivo" TEXT,
    "origen" "OrigenEstadoAsesor" NOT NULL,
    "cambiadoPorId" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),

    CONSTRAINT "HistorialEstadoAsesor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjustesEquipo" (
    "id" TEXT NOT NULL DEFAULT 'equipo',
    "modoAsignacion" "ModoAsignacion" NOT NULL DEFAULT 'automatica',
    "asesoresVenSoloSuyas" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AjustesEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistorialEstadoAsesor_usuarioId_inicio_idx" ON "HistorialEstadoAsesor"("usuarioId", "inicio");

-- AddForeignKey
ALTER TABLE "HistorialEstadoAsesor" ADD CONSTRAINT "HistorialEstadoAsesor_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialEstadoAsesor" ADD CONSTRAINT "HistorialEstadoAsesor_cambiadoPorId_fkey" FOREIGN KEY ("cambiadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_asesorResponsableId_fkey" FOREIGN KEY ("asesorResponsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

