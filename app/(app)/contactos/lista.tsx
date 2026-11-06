"use client";

import { Plus, SearchX, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { horaLista } from "@/app/(app)/bandeja/formato";
import { ModalCrear } from "@/components/contacto/modal-crear";
import { ModalUnir } from "@/components/contacto/modal-unir";
import { EstadoVacio, Esqueleto } from "@/components/ui/estados";
import { Avatar, IconoCanal, InsigniaEtiqueta, nombreCanal, opcionCanal, type Tono } from "@/components/ui/etiquetas";
import { Boton, Buscador, Selector } from "@/components/ui/form";
import { EncabezadoPagina, enlaceTabla, Tabla, type Columna, type Orden } from "@/components/ui/estructura";
import { CANALES } from "@/lib/canales/tipos";
import type { FilaContacto, FiltrosContactos } from "@/lib/contactos-tipos";
import { useActualizacion } from "@/lib/tiempo-real";
import { formatTelefono } from "@/lib/utils";
import { listarContactos } from "./actions";

const columnas: Columna<FilaContacto>[] = [
  {
    clave: "nombre",
    titulo: "Nombre",
    ordenable: true,
    render: (c) => (
      <Link href={`/contactos/${c.id}`} className="inline-flex items-center gap-3 hover:underline">
        <Avatar nombre={c.nombre} tamano="sm" />
        <span className={`${enlaceTabla} whitespace-nowrap`}>{c.nombre}</span>
      </Link>
    ),
  },
  { clave: "telefono", titulo: "Teléfono", render: (c) => <span className={c.telefono ? "whitespace-nowrap" : "whitespace-nowrap text-texto-suave"}>{c.telefono ? formatTelefono(c.telefono) : "Sin teléfono"}</span> },
  {
    clave: "canales",
    titulo: "Canales",
    render: (c) =>
      c.canales.length ? (
        <span className="flex flex-wrap items-center gap-1">
          {c.canales.map((k) => (
            <IconoCanal key={k} canal={k} />
          ))}
        </span>
      ) : (
        <span className="text-texto-suave">Ninguno</span>
      ),
  },
  {
    clave: "etiquetas",
    titulo: "Etiquetas",
    render: (c) => (
      <span className="flex flex-wrap gap-1">
        {c.etiquetas.map((t) => (
          <InsigniaEtiqueta key={t.id} nombre={t.nombre} tono={t.color as Tono} />
        ))}
      </span>
    ),
  },
  { clave: "ultimo", titulo: "Último contacto", ordenable: true, render: (c) => (c.ultimoContacto ? horaLista(c.ultimoContacto) : <span className="text-texto-suave">Sin mensajes</span>) },
];

export function ListaContactos({ etiquetas, asesores, esAdmin }: { etiquetas: { id: string; nombre: string }[]; asesores: { id: string; nombre: string }[]; esAdmin: boolean }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  const [etiquetaId, setEtiquetaId] = useState("");
  const [canal, setCanal] = useState<FiltrosContactos["canal"]>("todos");
  const [asesor, setAsesor] = useState("todos");
  const [orden, setOrden] = useState<Orden>({ clave: "ultimo", dir: "desc" });
  const [pagina, setPagina] = useState(1);
  const [crear, setCrear] = useState(false);
  const [unir, setUnir] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const filtros: FiltrosContactos = { q, etiquetaId, canal, asesor, orden: orden as FiltrosContactos["orden"], pagina };
  const { datos, fallo, refrescar } = useActualizacion(JSON.stringify(filtros), () => listarContactos(filtros), 15_000);
  const alFiltrar = <T,>(poner: (v: T) => void) => (v: T) => {
    poner(v);
    setPagina(1);
  };
  const ordenar = (clave: string) => {
    setOrden((o) => (o.clave === clave ? { clave, dir: o.dir === "asc" ? "desc" : "asc" } : { clave, dir: clave === "nombre" ? "asc" : "desc" }));
    setPagina(1);
  };
  const sinFiltros = !q && !etiquetaId && canal === "todos" && asesor === "todos";

  return (
    <div className="flex flex-col gap-4 p-6">
      <EncabezadoPagina titulo="Contactos">
        {esAdmin && (
          <Boton variante="secundario" onClick={() => setUnir(true)}>
            Unir contactos
          </Boton>
        )}
        <Boton onClick={() => setCrear(true)}>
          <Plus className="size-4" aria-hidden />
          Crear contacto
        </Boton>
      </EncabezadoPagina>

      <div className={`grid gap-3 ${esAdmin ? "md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]" : "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]"}`}>
        <div className="flex flex-col gap-1">
          <span className="cuerpo-fuerte">Buscar</span>
          <Buscador valor={busqueda} onCambio={alFiltrar(setBusqueda)} etiqueta="Buscar contactos" placeholder="Nombre, teléfono o correo" />
        </div>
        <Selector
          etiqueta="Etiqueta"
          value={etiquetaId}
          onCambio={alFiltrar(setEtiquetaId)}
          opciones={[{ valor: "", texto: "Todas" }, ...etiquetas.map((t) => ({ valor: t.id, texto: t.nombre }))]}
        />
        <Selector
          etiqueta="Canal"
          value={canal}
          onCambio={alFiltrar((v: string) => setCanal(v as FiltrosContactos["canal"]))}
          opciones={[{ valor: "todos", texto: "Todos" }, ...CANALES.map(opcionCanal)]}
        />
        {esAdmin && (
          <Selector
            etiqueta="Asesor responsable"
            value={asesor}
            onCambio={alFiltrar(setAsesor)}
            opciones={[{ valor: "todos", texto: "Todos" }, { valor: "sin", texto: "Sin asesor" }, ...asesores.map((a) => ({ valor: a.id, texto: a.nombre }))]}
          />
        )}
      </div>

      {!datos && fallo ? (
        <EstadoVacio icono={SearchX} titulo="No pudimos cargar los contactos" descripcion="Revise su conexión. Se volverá a intentar solo." accion={<Boton variante="secundario" onClick={refrescar}>Reintentar</Boton>} />
      ) : !datos ? (
        <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Esqueleto key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : datos.total === 0 ? (
        sinFiltros ? (
          <EstadoVacio
            icono={Users}
            titulo="Todavía no hay contactos"
            descripcion="Aparecen solos cuando un cliente escribe, o puede crear uno a mano."
            accion={
              <Boton variante="secundario" onClick={() => setCrear(true)}>
                <UserPlus className="size-4" aria-hidden />
                Crear contacto
              </Boton>
            }
          />
        ) : (
          <EstadoVacio icono={SearchX} titulo="No hay contactos con estos filtros" descripcion="Cambie los filtros o borre la búsqueda." />
        )
      ) : (
        <>
          <p className="meta text-texto-suave" aria-live="polite">
            {datos.total} {datos.total === 1 ? "contacto" : "contactos"}
          </p>
          <Tabla columnas={columnas} filas={datos.filas} idFila={(c) => c.id} alActivar={(c) => router.push(`/contactos/${c.id}`)} descripcion="Lista de contactos" orden={orden} onOrden={ordenar} pagina={Math.min(pagina, datos.paginas)} totalPaginas={datos.paginas} onPagina={setPagina} />
        </>
      )}

      <ModalCrear abierto={crear} onCerrar={() => setCrear(false)} />
      {esAdmin && <ModalUnir abierto={unir} onCerrar={() => setUnir(false)} onUnido={refrescar} />}
    </div>
  );
}
