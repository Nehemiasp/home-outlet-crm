"use client";

import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AreaTexto, Boton, CampoTexto, Interruptor, Selector } from "@/components/ui/form";
import { EncabezadoPagina, Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import type { CategoriaDTO, ProductoDetalle, Ubicacion } from "@/lib/catalogo-tipos";
import { cn } from "@/lib/utils";
import { borrarProducto, guardarProducto, subirFoto } from "./actions";

const MAX_FOTOS = 5;

export function FormularioProducto({ producto, categorias, ubicaciones }: { producto?: ProductoDetalle; categorias: CategoriaDTO[]; ubicaciones: Ubicacion[] }) {
  const router = useRouter();
  const avisar = useToast();
  const [d, setD] = useState({
    sku: producto?.sku ?? "",
    nombre: producto?.nombre ?? "",
    descripcion: producto?.descripcion ?? "",
    categoriaId: producto?.categoriaId ?? "",
    precio: producto ? (producto.precioCentavos / 100).toFixed(2) : "",
    activo: producto?.activo ?? true,
  });
  const [existencias, setExistencias] = useState<Record<string, string>>(Object.fromEntries(ubicaciones.map((u) => [u.id, String(producto?.existencias[u.id] ?? 0)])));
  const [fotos, setFotos] = useState<string[]>(producto?.imagenes ?? []);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState("");
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const campo = (k: keyof typeof d) => ({ value: d[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value }) });

  /* ── Fotos: hasta 5, se reordenan arrastrando o con los botones de flecha ── */
  const mover = (de: number, a: number) => {
    if (a < 0 || a >= fotos.length || de === a) return;
    const copia = [...fotos];
    copia.splice(a, 0, copia.splice(de, 1)[0]!);
    setFotos(copia);
  };
  const subir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const elegidas = [...(e.target.files ?? [])].slice(0, MAX_FOTOS - fotos.length);
    e.target.value = "";
    if (elegidas.length === 0) return;
    setSubiendo(true);
    const nuevas: string[] = [];
    for (const f of elegidas) {
      const form = new FormData();
      form.set("archivo", f);
      const r = await subirFoto(form);
      if (r.ok) nuevas.push(r.url);
      else avisar(`${f.name}: ${r.error}`, "error");
    }
    setSubiendo(false);
    setFotos((actuales) => [...actuales, ...nuevas].slice(0, MAX_FOTOS));
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const nums: Record<string, number> = {};
    for (const u of ubicaciones) {
      const t = (existencias[u.id] ?? "").trim();
      if (!/^\d{1,6}$/.test(t)) return setError(`En "${u.nombre}" escriba un número entero, de 0 en adelante.`);
      nums[u.id] = Number(t);
    }
    setGuardando(true);
    const r = await guardarProducto(producto?.id ?? null, { ...d, imagenes: fotos, existencias: nums });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar(producto ? "Producto guardado" : "Producto creado");
    router.push("/catalogo");
  };

  const confirmarBorrado = async () => {
    if (!producto) return;
    const r = await borrarProducto(producto.id);
    if (!r.ok) return setErrorBorrar(r.error);
    setBorrar(false);
    avisar("Producto borrado");
    router.push("/catalogo");
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <Link href="/catalogo" className="cuerpo-fuerte inline-flex items-center gap-2 self-start text-texto hover:underline max-md:min-h-11">
        <ArrowLeft className="size-4" aria-hidden />
        Catálogo
      </Link>
      <EncabezadoPagina titulo={producto ? "Editar producto" : "Nuevo producto"} />

      <form onSubmit={guardar} className="grid max-w-5xl items-start gap-6 lg:grid-cols-2">
        <section aria-label="Datos del producto" className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
          <h2 className="titulo-panel">Datos</h2>
          <CampoTexto etiqueta="Nombre" autoComplete="off" maxLength={120} {...campo("nombre")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto etiqueta="SKU" autoComplete="off" maxLength={40} ayuda="Código único. Letras, números, punto y guion." {...campo("sku")} />
            <CampoTexto etiqueta="Precio (Q)" inputMode="decimal" autoComplete="off" ayuda="Por ejemplo 1,250.00" {...campo("precio")} />
          </div>
          <Selector etiqueta="Categoría" value={d.categoriaId} onCambio={(v) => setD({ ...d, categoriaId: v })} opciones={[{ valor: "", texto: "Sin categoría" }, ...categorias.map((c) => ({ valor: c.id, texto: c.nombre }))]} />
          <AreaTexto etiqueta="Descripción" maxLength={2000} {...campo("descripcion")} />
          <Interruptor etiqueta={d.activo ? "Activo: se puede enviar a clientes" : "Inactivo: no aparece al enviar productos"} activo={d.activo} onCambio={(v) => setD({ ...d, activo: v })} />
        </section>

        <div className="flex flex-col gap-6">
          <section aria-label="Existencias" className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
            <h2 className="titulo-panel">Existencias</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {ubicaciones.map((u) => (
                <CampoTexto key={u.id} etiqueta={u.nombre} inputMode="numeric" autoComplete="off" value={existencias[u.id] ?? ""} onChange={(e) => setExistencias({ ...existencias, [u.id]: e.target.value })} />
              ))}
            </div>
          </section>

          <section aria-label="Fotos" className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-superficie p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="titulo-panel">Fotos</h2>
              <span className="meta text-texto-suave">
                {fotos.length} de {MAX_FOTOS}
              </span>
            </div>
            <p className="meta text-texto-suave">JPG, PNG o WebP, hasta 5 MB cada una. La primera es la foto principal. Arrastre para ordenar o use las flechas.</p>
            {fotos.length > 0 && (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
                {fotos.map((url, i) => (
                  <li
                    key={url}
                    draggable
                    onDragStart={() => setArrastrando(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (arrastrando !== null) mover(arrastrando, i);
                      setArrastrando(null);
                    }}
                    onDragEnd={() => setArrastrando(null)}
                    className={cn("flex cursor-grab flex-col gap-1 rounded-campo border border-linea p-1", arrastrando === i && "opacity-50")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Foto ${i + 1} del producto`} className="aspect-square w-full rounded-campo bg-fondo object-cover" />
                    <div className="flex flex-col gap-1">
                      <span className="meta text-texto-suave">{i === 0 ? "Principal" : `Foto ${i + 1}`}</span>
                      <span className="flex justify-between">
                        <button type="button" aria-label={`Mover la foto ${i + 1} a la izquierda`} disabled={i === 0} onClick={() => mover(i, i - 1)} className="grid size-8 cursor-pointer place-items-center rounded-campo hover:bg-fondo disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11">
                          <ArrowLeft className="size-4" aria-hidden />
                        </button>
                        <button type="button" aria-label={`Mover la foto ${i + 1} a la derecha`} disabled={i === fotos.length - 1} onClick={() => mover(i, i + 1)} className="grid size-8 cursor-pointer place-items-center rounded-campo hover:bg-fondo disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11">
                          <ArrowRight className="size-4" aria-hidden />
                        </button>
                        <button type="button" aria-label={`Quitar la foto ${i + 1}`} onClick={() => setFotos(fotos.filter((_, k) => k !== i))} className="grid size-8 cursor-pointer place-items-center rounded-campo text-error hover:bg-error-suave max-md:size-11">
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={subir} aria-label="Elegir fotos" tabIndex={-1} />
            <Boton variante="secundario" className="self-start" cargando={subiendo} disabled={fotos.length >= MAX_FOTOS} onClick={() => archivo.current?.click()}>
              <ImagePlus className="size-4" aria-hidden />
              Agregar fotos
            </Boton>
          </section>
        </div>

        {/* Barra fija abajo: siempre a la vista al hacer scroll (en teléfono queda sobre la barra de navegación). */}
        <div className="sticky bottom-14 z-10 flex flex-col gap-2 rounded-tarjeta border border-linea bg-superficie p-3 shadow-menu md:bottom-0 lg:col-span-2">
          {error && (
            <p role="alert" className="cuerpo rounded-campo bg-error-suave p-3 text-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Boton type="submit" cargando={guardando}>
              {producto ? "Guardar cambios" : "Crear producto"}
            </Boton>
            <Link href="/catalogo" className="cuerpo-fuerte inline-flex h-10 items-center rounded-campo border border-linea bg-superficie px-4 hover:bg-fondo max-md:min-h-11">
              Cancelar
            </Link>
          </div>
        </div>
      </form>

      {producto && (
        <section aria-label="Zona de peligro" className="flex max-w-5xl flex-col gap-3 rounded-tarjeta border border-estado-peligro-texto/40 bg-superficie p-4">
          <h2 className="titulo-seccion text-estado-peligro-texto">Zona de peligro</h2>
          <p className="cuerpo">Borrar el producto elimina también sus existencias y sus fotos, y no se puede deshacer. Si solo quiere dejar de ofrecerlo, desactívelo arriba.</p>
          <Boton variante="peligro-contorno" className="self-start" onClick={() => (setErrorBorrar(""), setBorrar(true))}>
            <Trash2 className="size-4" aria-hidden />
            Borrar producto
          </Boton>
        </section>
      )}

      <Modal abierto={borrar} onCerrar={() => setBorrar(false)} titulo="Borrar producto">
        <p className="cuerpo mb-4">
          Se borrará <strong>{producto?.nombre}</strong> con sus existencias y fotos. No se puede deshacer. Si solo quiere dejar de ofrecerlo, desactívelo.
        </p>
        {errorBorrar && (
          <p role="alert" className="cuerpo mb-4 rounded-campo bg-error-suave p-3 text-error">
            {errorBorrar}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setBorrar(false)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={confirmarBorrado}>
            Borrar producto
          </Boton>
        </div>
      </Modal>
    </div>
  );
}
