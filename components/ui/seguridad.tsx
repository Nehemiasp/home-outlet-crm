"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/estructura";
import { Boton } from "@/components/ui/form";

/** Aviso antes de cerrar la sesión por inactividad (ver lib/inactividad.ts). Cerrarlo con Escape o fuera del cuadro también es «seguir». */
export function AvisoInactividad({ abierto, segundos, onSeguir, onSalir }: { abierto: boolean; segundos: number; onSeguir: () => void; onSalir: () => void }) {
  return (
    <Modal abierto={abierto} onCerrar={onSeguir} titulo="¿Sigue ahí?">
      <p className="cuerpo mb-4">
        Por seguridad, su sesión se cerrará en <span className="cuerpo-fuerte tabular-nums">{segundos} s</span> porque nadie ha usado el sistema en un buen rato.
      </p>
      <div className="flex justify-end gap-2">
        <Boton variante="secundario" onClick={onSalir}>
          Salir ahora
        </Boton>
        <Boton onClick={onSeguir}>Seguir en el sistema</Boton>
      </div>
    </Modal>
  );
}

/** Los códigos de respaldo del segundo factor: se muestran una sola vez, para guardarlos antes de seguir. */
export function CodigosRespaldo({ codigos, onListo, textoListo = "Ya los guardé" }: { codigos: string[]; onListo: () => void; textoListo?: string }) {
  const [copiados, setCopiados] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigos.join("\n"));
      setCopiados(true);
    } catch {
      // si el navegador no deja copiar, se pueden seleccionar a mano
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-2 rounded-campo border border-linea bg-fondo p-3 font-mono text-base select-all" aria-label="Códigos de respaldo">
        {codigos.map((c) => (
          <li key={c} className="text-center tracking-wider">
            {c}
          </li>
        ))}
      </ul>
      <p className="cuerpo rounded-campo bg-aviso-suave p-3 text-aviso">Guárdelos en un lugar seguro (un gestor de contraseñas o impresos). Cada uno sirve una sola vez, para entrar si pierde el teléfono. No se vuelven a mostrar.</p>
      <div className="flex justify-end gap-2">
        <Boton variante="secundario" onClick={copiar}>
          {copiados ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copiados ? "Copiados" : "Copiar"}
        </Boton>
        <Boton onClick={onListo}>{textoListo}</Boton>
      </div>
    </div>
  );
}

/** El QR del segundo factor y, debajo, la clave para teclearla si no se puede escanear. */
export function QrSegundoFactor({ qr, secreto }: { qr: string; secreto: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Imagen generada aquí mismo (dirección data:), no un servicio de fuera: el secreto no sale del servidor. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="Código QR para la aplicación de autenticación" width={216} height={216} className="size-54 rounded-campo border border-linea bg-white p-1" />
      <p className="meta text-texto-suave">¿No puede escanearlo? Escriba esta clave en su aplicación:</p>
      <p className="rounded-campo border border-linea bg-fondo px-3 py-2 text-center font-mono text-sm tracking-wider select-all" aria-label="Clave para escribir a mano">
        {secreto}
      </p>
    </div>
  );
}
