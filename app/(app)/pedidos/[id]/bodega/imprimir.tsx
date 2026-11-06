"use client";

import { Printer } from "lucide-react";
import { Boton } from "@/components/ui/form";

export function BotonImprimir() {
  return (
    <Boton onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden />
      Imprimir
    </Boton>
  );
}
