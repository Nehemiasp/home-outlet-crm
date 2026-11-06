-- CreateTable
CREATE TABLE "Candado" (
    "clave" TEXT NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candado_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "IntentoTasa" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoTasa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntentoTasa_clave_creadoEn_idx" ON "IntentoTasa"("clave", "creadoEn");
