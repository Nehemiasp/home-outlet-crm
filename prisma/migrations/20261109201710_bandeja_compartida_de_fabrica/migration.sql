-- La bandeja compartida es el modo de fábrica (la pidió Home Outlet el 9-nov-2026): también para la fila de ajustes que ya existe.
ALTER TABLE "AjustesEquipo" ALTER COLUMN "modoAsignacion" SET DEFAULT 'compartida';
UPDATE "AjustesEquipo" SET "modoAsignacion" = 'compartida';
