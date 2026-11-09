-- El pago contra entrega viene encendido (lo pidió Home Outlet el 9-nov-2026), también en la fila de ajustes que ya existe.
ALTER TABLE "AjustesPedidos" ALTER COLUMN "metodos" SET DEFAULT ARRAY['transferencia', 'deposito', 'contra_entrega']::"TipoPago"[];
UPDATE "AjustesPedidos" SET "metodos" = array_append("metodos", 'contra_entrega') WHERE NOT ('contra_entrega' = ANY("metodos"));
