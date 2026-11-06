"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Boton, CampoTexto } from "@/components/ui/form";
import { entrar } from "./actions";

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(entrar, undefined);
  return (
    <form action={accion} className="flex flex-col gap-4">
      <CampoTexto etiqueta="Correo" name="correo" type="email" autoComplete="username" defaultValue={estado?.correo} required />
      <CampoTexto etiqueta="Contraseña" name="password" type="password" autoComplete="current-password" required />
      {estado && (
        <p role="alert" className="cuerpo flex items-start gap-2 rounded-campo bg-error-suave p-3 text-error">
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
          {estado.error}
        </p>
      )}
      <Boton type="submit" cargando={pendiente} className="w-full">
        Entrar
      </Boton>
    </form>
  );
}
