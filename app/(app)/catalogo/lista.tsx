"use client";

import { LayoutGrid, List, PackageSearch, Plus, SearchX, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EstadoVacio, Esqueleto } from "@/components/ui/estados";
import { Insignia } from "@/components/ui/etiquetas";
import { Boton, Buscador, ControlSegmentado, Selector } from "@/components/ui/form";
import { EncabezadoPagina, enlaceTabla, Paginacion, Tabla, type Columna } from "@/components/ui/estructura";
import type { CategoriaDTO, FilaProducto, FiltrosCatalogo, Ubicacion } from "@/lib/catalogo-tipos";
import { useActualizacion } from "@/lib/tiempo-real";
import { formatQ } from "@/lib/utils";
import { listar } from "./actions";
import { AjusteRapido } from "./ajuste-rapido";
import { CeldaExistencia, columnaDeUbicacion, Existencias, FotoProducto } from "./existencias";

export function Catalogo({ categorias, puedeGestionar }: { categorias: CategoriaDTO[]; puedeGestionar: boolean }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [estado, setEstado] = useState<FiltrosCatalogo["estado"]>("todos");
  const [pagina, setPagina] = useState(1);
  const [vista, setVista] = useState<"lista" | "cuadricula">("lista");
  const [ajustando, setAjustando] = useState<FilaProducto | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem("catalogo-vista") === "cuadricula") setVista("cuadricula");
    } catch {
      // sin almacenamiento: queda la vista de lista
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const filtros: FiltrosCatalogo = { q, categoriaId, estado, pagina };
  const { datos, fallo, refrescar } = useActualizacion(JSON.stringify(filtros), () => listar(filtros), 20_000);
  const alFiltrar = <T,>(poner: (v: T) => void) => (v: T) => {
    poner(v);
    setPagina(1);
  };
  const elegirVista = (v: typeof vista) => {
    setVista(v);
    try {
      localStorage.setItem("catalogo-vista", v);
    } catch {
      // no pasa nada si no se puede recordar
    }
  };
  const ubicaciones: Ubicacion[] = datos?.ubicaciones ?? [];
  const sinFiltros = !q && !categoriaId && estado === "todos";

  const nombre = (p: FilaProducto) => (puedeGestionar ? <Link href={`/catalogo/${p.id}`} className={enlaceTabla}>{p.nombre}</Link> : <span className="cuerpo-fuerte">{p.nombre}</span>);
  const foto = (p: FilaProducto, clase: string) => <FotoProducto url={p.imagen} className={clase} />;

  const columnas: Columna<FilaProducto>[] = [
    {
      clave: "producto",
      titulo: "Producto",
      render: (p) => (
        <span className="flex items-center gap-3">
          {foto(p, "size-12 shrink-0 rounded-campo")}
          <span className="flex flex-col items-start gap-1">
            {nombre(p)}
            {!p.activo && <Insignia tono="gris">Inactivo</Insignia>}
          </span>
        </span>
      ),
    },
    { clave: "sku", titulo: "SKU", render: (p) => <span className="whitespace-nowrap">{p.sku}</span> },
    { clave: "categoria", titulo: "Categoría", ocultarHastaXl: true, render: (p) => p.categoria ?? <span className="text-texto-suave">Sin categoría</span> },
    { clave: "precio", titulo: "Precio", alinear: "der", render: (p) => <span className="cuerpo-fuerte whitespace-nowrap">{formatQ(p.precioCentavos)}</span> },
    // Una columna por ubicación («Física», «En línea»): el número y, si aplica, «Quedan N» o «Sin existencia».
    ...ubicaciones.map((u): Columna<FilaProducto> => ({
      clave: `existencia-${u.id}`,
      titulo: columnaDeUbicacion(u.nombre),
      render: (p) => <CeldaExistencia disponible={Math.max(0, (p.existencias[u.id] ?? 0) - (p.apartados[u.id] ?? 0))} apartado={p.apartados[u.id] ?? 0} />,
    })),
    {
      clave: "acciones",
      titulo: "Acciones",
      render: (p) => (
        <Boton variante="secundario" tamano="sm" onClick={() => setAjustando(p)} aria-label={`Ajustar existencias de ${p.nombre}`}>
          Ajustar
        </Boton>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-6">
      <EncabezadoPagina titulo="Catálogo">
        {puedeGestionar && (
          <>
            <Link href="/catalogo/importar" className="cuerpo-fuerte inline-flex h-10 items-center justify-center gap-2 rounded-campo border border-linea bg-superficie px-4 hover:bg-fondo max-md:min-h-11">
              <Upload className="size-4" aria-hidden />
              Importar CSV
            </Link>
            <Link href="/catalogo/nuevo" className="cuerpo-fuerte inline-flex h-10 items-center justify-center gap-2 rounded-campo bg-naranja px-4 text-carbon hover:brightness-95 max-md:min-h-11">
              <Plus className="size-4" aria-hidden />
              Nuevo producto
            </Link>
          </>
        )}
      </EncabezadoPagina>

      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <div className="flex flex-col gap-1">
          <span className="cuerpo-fuerte">Buscar</span>
          <Buscador valor={busqueda} onCambio={alFiltrar(setBusqueda)} etiqueta="Buscar productos" placeholder="Nombre o SKU" />
        </div>
        <Selector etiqueta="Categoría" value={categoriaId} onCambio={alFiltrar(setCategoriaId)} opciones={[{ valor: "", texto: "Todas" }, ...categorias.map((c) => ({ valor: c.id, texto: c.nombre }))]} />
        <Selector
          etiqueta="Estado"
          value={estado}
          onCambio={alFiltrar((v: string) => setEstado(v as FiltrosCatalogo["estado"]))}
          opciones={[{ valor: "todos", texto: "Todos" }, { valor: "activos", texto: "Activos" }, { valor: "inactivos", texto: "Inactivos" }]}
        />
        <ControlSegmentado
          etiqueta="Vista del catálogo"
          valor={vista}
          onCambio={elegirVista}
          opciones={[
            { valor: "lista", texto: "Lista", icono: List },
            { valor: "cuadricula", texto: "Cuadrícula", icono: LayoutGrid },
          ]}
        />
      </div>

      {!datos && fallo ? (
        <EstadoVacio icono={SearchX} titulo="No pudimos cargar el catálogo" descripcion="Revise su conexión. Se volverá a intentar solo." accion={<Boton variante="secundario" onClick={refrescar}>Reintentar</Boton>} />
      ) : !datos ? (
        <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Esqueleto key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : datos.total === 0 ? (
        sinFiltros ? (
          <EstadoVacio
            icono={PackageSearch}
            titulo="Todavía no hay productos"
            descripcion={puedeGestionar ? "Cree uno o importe una lista desde un archivo CSV." : "Un administrador o un jefe de tienda puede cargar los productos."}
            accion={puedeGestionar ? <Link href="/catalogo/importar" className="cuerpo-fuerte inline-flex h-10 items-center rounded-campo border border-linea bg-superficie px-4 hover:bg-fondo">Importar CSV</Link> : undefined}
          />
        ) : (
          <EstadoVacio icono={SearchX} titulo="No hay productos con estos filtros" descripcion="Cambie los filtros o borre la búsqueda." />
        )
      ) : (
        <>
          <p className="meta text-texto-suave" aria-live="polite">
            {datos.total} {datos.total === 1 ? "producto" : "productos"}
          </p>
          {vista === "lista" ? (
            <Tabla columnas={columnas} filas={datos.filas} idFila={(p) => p.id} alActivar={puedeGestionar ? (p) => router.push(`/catalogo/${p.id}`) : undefined} descripcion="Lista de productos" pagina={Math.min(pagina, datos.paginas)} totalPaginas={datos.paginas} onPagina={setPagina} />
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {datos.filas.map((p) => (
                  <li key={p.id} className="flex flex-col overflow-hidden rounded-tarjeta border border-linea bg-superficie">
                    {foto(p, "aspect-4/3 w-full")}
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        {nombre(p)}
                        {!p.activo && <Insignia tono="gris">Inactivo</Insignia>}
                      </div>
                      <p className="meta text-texto-suave">
                        SKU {p.sku} · {p.categoria ?? "Sin categoría"}
                      </p>
                      <p className="titulo-panel">{formatQ(p.precioCentavos)}</p>
                      <Existencias ubicaciones={ubicaciones} existencias={p.existencias} apartados={p.apartados} />
                      <Boton variante="secundario" tamano="sm" className="mt-auto self-start" onClick={() => setAjustando(p)} aria-label={`Ajustar existencias de ${p.nombre}`}>
                        Ajustar existencias
                      </Boton>
                    </div>
                  </li>
                ))}
              </ul>
              <Paginacion pagina={Math.min(pagina, datos.paginas)} totalPaginas={datos.paginas} onPagina={setPagina} className="rounded-tarjeta border border-linea bg-superficie" />
            </>
          )}
        </>
      )}

      <AjusteRapido producto={ajustando} ubicaciones={ubicaciones} onCerrar={() => setAjustando(null)} onGuardado={refrescar} />
    </div>
  );
}
