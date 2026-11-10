"use client";

import { useActionState, useState } from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { Boton, CampoTexto, Casilla } from "@/components/ui/form";
import { DIAS_RECORDAR } from "@/lib/recordar-equipo-texto";
import { entrar } from "./actions";

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(entrar, undefined);
  // Se guardan aquí para que sigan en el formulario cuando pasa al segundo paso (el formulario se vacía después de cada envío).
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const segundoPaso = estado?.paso === "codigo";
  return (
    <form action={accion} className="flex flex-col gap-4">
      {segundoPaso ? (
        <>
          <input type="hidden" name="correo" value={correo} />
          <input type="hidden" name="password" value={password} />
          <p className="cuerpo flex items-start gap-2 text-texto-suave">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-exito" aria-hidden />
            <span>Escriba el código de 6 dígitos que muestra su aplicación de autenticación. Si perdió el teléfono, use un código de respaldo.</span>
          </p>
          <CampoTexto etiqueta="Código" name="codigo" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} maxLength={14} autoFocus required />
          <div className="flex flex-col">
            <Casilla name="recordar" defaultChecked etiqueta={`No volver a pedirlo en este equipo por ${DIAS_RECORDAR} días`} />
            <p className="meta text-texto-suave">Desde otra red o en otro equipo se lo volverá a pedir. En una computadora compartida, desmárquela.</p>
          </div>
        </>
      ) : (
        <>
          <CampoTexto etiqueta="Correo" name="correo" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          <CampoTexto etiqueta="Contraseña" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </>
      )}
      {estado?.error && (
        <p role="alert" className="cuerpo flex items-start gap-2 rounded-campo bg-error-suave p-3 text-error">
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
          {estado.error}
        </p>
      )}
      <Boton type="submit" cargando={pendiente} className="w-full">
        {segundoPaso ? "Verificar" : "Entrar"}
      </Boton>
      {segundoPaso && (
        <a href="/login" className="cuerpo text-center text-texto-suave underline">
          Volver
        </a>
      )}
    </form>
  );
}
