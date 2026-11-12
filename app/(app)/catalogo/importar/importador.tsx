"use client";

import { ArrowLeft, CheckCircle2, Download, FileUp } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Insignia } from "@/components/ui/etiquetas";
import { Boton } from "@/components/ui/form";
import { Tabla, type Columna } from "@/components/ui/estructura";
import type { FilaVistaPrevia } from "@/lib/catalogo-tipos";
import { formatQ } from "@/lib/utils";
import { importarCsv, previsualizarCsv } from "../actions";
import { FotosPorSku } from "./fotos-por-sku";

const PLANTILLA = "sku,nombre,categoria,precio,descripcion,existencia_puerto_barrios,existencia_mixco\nHG-100,Licuadora de ejemplo,Hogar,349.00,Descripción de ejemplo,5,2\n";
const POR_PAGINA = 50;

const columnas: Columna<FilaVistaPrevia>[] = [
  { clave: "linea", titulo: "Línea", render: (f) => f.linea },
  { clave: "sku", titulo: "SKU", render: (f) => <span className="whitespace-nowrap">{f.sku || "—"}</span> },
  { clave: "nombre", titulo: "Nombre", render: (f) => f.nombre || "—" },
  {
    clave: "categoria",
    titulo: "Categoría",
    render: (f) => (
      <span className="flex flex-wrap items-center gap-1">
        {f.categoria || "—"}
        {f.categoriaNueva && <Insignia tono="naranja">Nueva</Insignia>}
      </span>
    ),
  },
  { clave: "precio", titulo: "Precio", render: (f) => (f.precioCentavos ? <span className="whitespace-nowrap">{formatQ(f.precioCentavos)}</span> : "—") },
  { clave: "existencias", titulo: "Puerto Barrios / Mixco", render: (f) => `${f.tienda} / ${f.enLinea}` },
  {
    clave: "resultado",
    titulo: "Resultado",
    render: (f) =>
      f.accion === "error" ? (
        <span className="flex flex-col items-start gap-1">
          <Insignia tono="error">Error</Insignia>
          <ul className="meta text-error">
            {f.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </span>
      ) : (
        <Insignia tono={f.accion === "crear" ? "exito" : "aviso"}>{f.accion === "crear" ? "Se creará" : "Se actualizará"}</Insignia>
      ),
  },
];

export function Importador() {
  const entrada = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [nombre, setNombre] = useState("");
  const [filas, setFilas] = useState<FilaVistaPrevia[] | null>(null);
  const [error, setError] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ creados: number; actualizados: number; omitidas: number; categoriasNuevas: number } | null>(null);
  const [pagina, setPagina] = useState(1);

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setResultado(null);
    setError("");
    setFilas(null);
    setPagina(1);
    if (f.size > 1024 * 1024) return setError("El archivo pesa más de 1 MB. Divídalo en partes.");
    const t = await f.text();
    setNombre(f.name);
    setTexto(t);
    setRevisando(true);
    const r = await previsualizarCsv(t);
    setRevisando(false);
    if (r.error) return setError(r.error);
    setFilas(r.filas);
  };

  const importar = async () => {
    setImportando(true);
    const r = await importarCsv(texto);
    setImportando(false);
    if (r.error) return setError(r.error);
    setResultado(r);
    setFilas(null);
  };

  const validas = filas?.filter((f) => f.accion !== "error") ?? [];
  const conError = (filas?.length ?? 0) - validas.length;
  const nuevas = new Set(filas?.filter((f) => f.categoriaNueva && f.accion !== "error").map((f) => f.categoria.toLowerCase()));
  const totalPaginas = Math.max(1, Math.ceil((filas?.length ?? 0) / POR_PAGINA));

  return (
    <div className="flex flex-col gap-4 p-6">
      <Link href="/catalogo" className="cuerpo-fuerte inline-flex items-center gap-2 self-start text-naranja-texto hover:underline max-md:min-h-11">
        <ArrowLeft className="size-4" aria-hidden />
        Catálogo
      </Link>
      <h1 className="titulo-pagina">Importar productos desde CSV</h1>

      <section className="flex max-w-3xl flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
        <h2 className="titulo-panel">1. Elija el archivo</h2>
        <p className="cuerpo text-texto-suave">
          Columnas: <code className="cuerpo-fuerte">sku, nombre, categoria, precio, descripcion, existencia_puerto_barrios, existencia_mixco</code>. Las obligatorias son sku, nombre y precio. Sirve el CSV de Excel con comas o con punto y coma.
        </p>
        <p className="cuerpo text-texto-suave">Si el SKU ya existe, el producto se actualiza (nombre, categoría, precio, descripción y existencias). Si no, se crea. Las categorías que falten se crean solas.</p>
        <div className="flex flex-wrap gap-2">
          <input ref={entrada} type="file" accept=".csv,text/csv" className="hidden" onChange={elegir} aria-label="Elegir archivo CSV" tabIndex={-1} />
          <Boton cargando={revisando} onClick={() => entrada.current?.click()}>
            <FileUp className="size-4" aria-hidden />
            Elegir archivo CSV
          </Boton>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(PLANTILLA)}`} download="plantilla-productos.csv" className="cuerpo-fuerte inline-flex h-10 items-center gap-2 rounded-campo border border-linea bg-superficie px-4 hover:bg-fondo max-md:min-h-11">
            <Download className="size-4" aria-hidden />
            Descargar plantilla
          </a>
        </div>
        {nombre && !error && <p className="meta text-texto-suave">Archivo: {nombre}</p>}
        {error && (
          <p role="alert" className="cuerpo rounded-campo bg-error-suave p-3 text-error">
            {error}
          </p>
        )}
      </section>

      {resultado && (
        <section aria-live="polite" className="flex max-w-3xl flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
          <h2 className="titulo-panel flex items-center gap-2">
            <CheckCircle2 className="size-5 text-exito" aria-hidden />
            Importación lista
          </h2>
          <ul className="cuerpo">
            <li>Productos creados: <strong>{resultado.creados}</strong></li>
            <li>Productos actualizados: <strong>{resultado.actualizados}</strong></li>
            <li>Categorías nuevas: <strong>{resultado.categoriasNuevas}</strong></li>
            <li>Filas omitidas por errores: <strong>{resultado.omitidas}</strong></li>
          </ul>
          <Link href="/catalogo" className="cuerpo-fuerte inline-flex h-10 items-center self-start rounded-campo bg-naranja px-4 text-carbon hover:brightness-95">
            Ver el catálogo
          </Link>
        </section>
      )}

      {filas && (
        <section className="flex flex-col gap-3">
          <h2 className="titulo-panel">2. Revise antes de importar</h2>
          <p className="cuerpo" aria-live="polite">
            {filas.length} {filas.length === 1 ? "fila" : "filas"}: <strong>{validas.length}</strong> listas para importar y <strong className={conError ? "text-error" : ""}>{conError}</strong> con errores.
            {nuevas.size > 0 && ` Se ${nuevas.size === 1 ? "creará 1 categoría nueva" : `crearán ${nuevas.size} categorías nuevas`}.`}
          </p>
          {conError > 0 && <p className="cuerpo rounded-campo bg-aviso-suave p-3 text-aviso">Las filas con errores no se importan. Corrija el archivo y vuélvalo a subir cuando quiera; los productos ya importados se actualizan, no se duplican.</p>}
          <Tabla
            columnas={columnas}
            filas={filas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)}
            idFila={(f) => String(f.linea)}
            descripcion="Vista previa de la importación"
            pagina={pagina}
            totalPaginas={totalPaginas}
            onPagina={setPagina}
          />
          <Boton className="self-start" disabled={validas.length === 0} cargando={importando} onClick={importar}>
            Importar {validas.length} {validas.length === 1 ? "producto" : "productos"}
          </Boton>
        </section>
      )}

      <FotosPorSku />
    </div>
  );
}
