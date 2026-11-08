"use client";

import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { Boton, CampoTexto } from "@/components/ui/form";
import { CodigosRespaldo, QrSegundoFactor } from "@/components/ui/seguridad";
import { salir } from "@/app/login/actions";
import { confirmarSegundoFactor } from "./actions";

export function ActivarSegundoFactor({ nombre, qr, secreto }: { nombre: string; qr: string; secreto: string }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respaldos, setRespaldos] = useState<string[] | null>(null);

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError("");
    const r = await confirmarSegundoFactor(codigo);
    setEnviando(false);
    if (r.ok) setRespaldos(r.respaldos);
    else setError(r.error);
  };

  if (respaldos) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="titulo-panel">Segundo factor activado</h1>
        <p className="cuerpo text-texto-suave">Listo, {nombre}. Estos son sus códigos de respaldo. Después de guardarlos, vuelva a entrar con su contraseña y el código de su aplicación.</p>
        <CodigosRespaldo codigos={respaldos} onListo={() => void salir()} textoListo="Ya los guardé, entrar de nuevo" />
      </div>
    );
  }
  return (
    <form onSubmit={confirmar} className="flex flex-col gap-4">
      <h1 className="titulo-panel">Active el segundo factor</h1>
      <p className="cuerpo text-texto-suave">Hola, {nombre}. Para proteger el sistema, su cuenta necesita un código de su teléfono además de la contraseña. Solo se hace una vez.</p>
      <ol className="cuerpo flex list-decimal flex-col gap-1 pl-5">
        <li>Instale una aplicación de autenticación (Google Authenticator, Microsoft Authenticator, Authy o la de su gestor de contraseñas).</li>
        <li>Escanee este código QR con ella.</li>
        <li>Escriba abajo el código de 6 dígitos que le muestra.</li>
      </ol>
      <QrSegundoFactor qr={qr} secreto={secreto} />
      <CampoTexto etiqueta="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
      {error && (
        <p role="alert" className="cuerpo flex items-start gap-2 rounded-campo bg-error-suave p-3 text-error">
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <Boton type="submit" cargando={enviando} className="w-full">
        Activar
      </Boton>
    </form>
  );
}
