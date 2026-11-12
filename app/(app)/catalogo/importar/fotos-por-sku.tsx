"use client";

import { ImageUp } from "lucide-react";
import { useRef, useState } from "react";
import { Insignia } from "@/components/ui/etiquetas";
import { Boton } from "@/components/ui/form";
import { subirFotoPorSku } from "../actions";

type Fila = { archivo: string; estado: "esperando" | "subiendo" | "principal" | "agregada" | "repetida" | "error"; detalle: string };

const INSIGNIA: Record<Fila["estado"], { texto: string; estado: "neutro" | "info" | "exito" | "aviso" | "peligro" }> = {
  esperando: { texto: "En espera", estado: "neutro" },
  subiendo: { texto: "Subiendo…", estado: "info" },
  principal: { texto: "Foto principal", estado: "exito" },
  agregada: { texto: "Agregada", estado: "exito" },
  repetida: { texto: "Ya la tenía", estado: "neutro" },
  error: { texto: "No se subió", estado: "peligro" },
};

/** Sube muchas fotos de una vez: cada una va al producto cuyo SKU va al inicio del nombre del archivo. Se mandan de una en una. */
export function FotosPorSku() {
  const entrada = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [subiendo, setSubiendo] = useState(false);

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = [...(e.target.files ?? [])].sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
    e.target.value = "";
    if (!archivos.length) return;
    const lista: Fila[] = archivos.map((a) => ({ archivo: a.name, estado: "esperando", detalle: "" }));
    setFilas(lista);
    setSubiendo(true);
    for (let i = 0; i < archivos.length; i++) {
      const cambiar = (f: Partial<Fila>) => setFilas((prev) => prev.map((x, k) => (k === i ? { ...x, ...f } : x)));
      cambiar({ estado: "subiendo" });
      const datos = new FormData();
      datos.set("archivo", archivos[i]!);
      const r = await subirFotoPorSku(datos).catch(() => ({ ok: false as const, error: "Se cortó la conexión. Vuelva a elegir las fotos que falten." }));
      cambiar(r.ok ? { estado: r.estado, detalle: `${r.sku} · ${r.producto}` } : { estado: "error", detalle: r.error });
    }
    setSubiendo(false);
  };

  const hechas = filas.filter((f) => f.estado === "principal" || f.estado === "agregada").length;
  const repetidas = filas.filter((f) => f.estado === "repetida").length;
  const errores = filas.filter((f) => f.estado === "error").length;
  const pendientes = filas.filter((f) => f.estado === "esperando" || f.estado === "subiendo").length;

  return (
    <section className="flex max-w-3xl flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
      <h2 className="titulo-panel">Fotos por SKU</h2>
      <p className="cuerpo text-texto-suave">
        Elija varias fotos a la vez. Cada una se agrega al producto cuyo SKU va al inicio del nombre del archivo: <code className="cuerpo-fuerte">HO-001-aspiradora.jpg</code> o <code className="cuerpo-fuerte">HO-001.jpg</code> van a HO-001. Si el producto no tenía fotos, queda como la principal. Una foto que el producto ya tiene no se repite.
      </p>
      <p className="meta text-texto-suave">JPG, PNG o WebP de hasta 5 MB. Máximo 5 fotos por producto. Importe primero el CSV para que los productos existan.</p>
      <div>
        <input ref={entrada} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={elegir} aria-label="Elegir fotos" tabIndex={-1} />
        <Boton variante="secundario" cargando={subiendo} onClick={() => entrada.current?.click()}>
          <ImageUp className="size-4" aria-hidden />
          Elegir fotos
        </Boton>
      </div>
      {filas.length > 0 && (
        <>
          <p className="cuerpo" aria-live="polite">
            {pendientes > 0 ? `Subiendo ${filas.length - pendientes + 1} de ${filas.length}… No cierre esta página.` : `Listo: ${hechas} ${hechas === 1 ? "foto agregada" : "fotos agregadas"}`}
            {pendientes === 0 && repetidas > 0 && `, ${repetidas} ya ${repetidas === 1 ? "estaba" : "estaban"}`}
            {pendientes === 0 && errores > 0 && <strong className="text-error">{`, ${errores} sin subir`}</strong>}
            {pendientes === 0 && "."}
          </p>
          <ul className="flex max-h-96 flex-col divide-y divide-linea overflow-y-auto rounded-tarjeta border border-linea">
            {filas.map((f, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2">
                <span className="cuerpo min-w-0 flex-1 truncate">{f.archivo}</span>
                <Insignia estado={INSIGNIA[f.estado].estado}>{INSIGNIA[f.estado].texto}</Insignia>
                {f.detalle && <span className={`meta w-full ${f.estado === "error" ? "text-error" : "text-texto-suave"}`}>{f.detalle}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
