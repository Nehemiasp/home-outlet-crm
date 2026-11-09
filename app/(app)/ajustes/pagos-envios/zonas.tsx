"use client";

import { Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EstadoVacio } from "@/components/ui/estados";
import { Insignia } from "@/components/ui/etiquetas";
import { AreaTexto, Boton, Casilla, CampoTexto, GrupoCasillas } from "@/components/ui/form";
import { Modal } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import { DEPARTAMENTOS, municipiosDe } from "@/lib/guatemala";
import { describirZona, type Zona } from "@/lib/pedidos/envio";
import { formatQ } from "@/lib/utils";
import { borrarZonaEnvio, guardarDireccionTienda, guardarZonaEnvio } from "../actions";

type Tienda = { id: string; nombre: string; direccion: string | null };

const NUEVA = { nombre: "", departamentos: [] as string[], municipios: [] as string[], costo: "", tiempo: "", activa: true };
const aForm = (z: Zona) => ({ nombre: z.nombre, departamentos: z.departamentos, municipios: z.municipios, costo: (z.costo / 100).toFixed(2), tiempo: z.tiempo, activa: z.activa });

/**
 * `cobraZona`: si el envío se cobra según la zona. Con «envío gratis con las demás formas de pago» encendido (lo de fábrica) el costo
 * lo pone la forma de pago (Q35 contra entrega; con las demás, gratis desde Q200 y Q35 por debajo) y el de la zona no se usa: no se muestra ni se pide.
 */
export function Zonas({ filas, tiendas, horario, cobraZona }: { filas: Zona[]; tiendas: Tienda[]; horario: string | null; cobraZona: boolean }) {
  const router = useRouter();
  const avisar = useToast();
  const [editando, setEditando] = useState<Zona | "nueva" | null>(null);
  const [form, setForm] = useState(NUEVA);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState<Zona | null>(null);
  const [tienda, setTienda] = useState<Tienda | null>(null);
  const [direccion, setDireccion] = useState("");

  const editarTienda = (t: Tienda) => {
    setDireccion(t.direccion ?? "");
    setError("");
    setTienda(t);
  };
  const guardarTienda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tienda) return;
    setGuardando(true);
    const r = await guardarDireccionTienda(tienda.id, direccion);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Dirección guardada");
    setTienda(null);
    router.refresh();
  };

  const abrir = (z: Zona | "nueva") => {
    setForm(z === "nueva" ? { ...NUEVA, costo: cobraZona ? "" : "0" } : aForm(z)); // sin cobro por zona, una zona nueva guarda costo 0
    setError("");
    setEditando(z);
  };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const r = await guardarZonaEnvio(editando && editando !== "nueva" ? editando.id : null, form);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    avisar("Zona guardada");
    setEditando(null);
    router.refresh();
  };
  const confirmarBorrado = async () => {
    const z = borrar;
    setBorrar(null);
    if (!z) return;
    const r = await borrarZonaEnvio(z.id);
    avisar(r.ok ? "Zona borrada" : r.error, r.ok ? "exito" : "error");
    router.refresh();
  };

  return (
    <section aria-labelledby="t-envios" className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="t-envios" className="titulo-panel">Envíos</h2>
          <p className="cuerpo max-w-xl text-texto-suave">
            {cobraZona
              ? "El costo se calcula solo según el departamento y el municipio de entrega. "
              : "El costo del envío lo pone la forma de pago (ver «Costo del envío» arriba); las zonas dicen a dónde se entrega y en cuánto tiempo. "}
            Una zona puede cubrir departamentos enteros o solo algunos municipios; la que no marca ninguno sirve para «el resto del país».
          </p>
        </div>
        <Boton onClick={() => abrir("nueva")}>
          <Plus className="size-4" aria-hidden />
          Nueva zona
        </Boton>
      </div>

      <div className="flex flex-col gap-2 rounded-campo border border-linea bg-fondo p-3">
        <p className="cuerpo-fuerte">Recoger en tienda</p>
        <ul className="flex flex-col divide-y divide-linea">
          {tiendas.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1 basis-56">
                <p className="cuerpo-fuerte">{t.nombre}</p>
                <p className="cuerpo text-texto-suave">{t.direccion || "Falta la dirección"}</p>
              </div>
              <Boton variante="secundario" tamano="sm" onClick={() => editarTienda(t)} aria-label={`Editar la dirección de ${t.nombre}`}>
                Editar
              </Boton>
            </li>
          ))}
        </ul>
        <p className="meta text-texto-suave">
          Al crear el pedido se elige en cuál recoge el cliente; el resumen lleva esa dirección. Horario: {horario || "falta"} (de{" "}
          <Link href="/ajustes/negocio" className="underline hover:text-texto">
            Datos del negocio
          </Link>
          ).
        </p>
      </div>

      {filas.length === 0 ? (
        <EstadoVacio icono={Truck} titulo="Todavía no hay zonas de envío" descripcion={cobraZona ? "Agregue las zonas con su costo para poder crear pedidos con envío." : "Agregue las zonas con su tiempo de entrega para poder crear pedidos con envío."} />
      ) : (
        <ul className="flex flex-col divide-y divide-linea rounded-tarjeta border border-linea">
          {filas.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 basis-56">
                <p className="cuerpo-fuerte flex flex-wrap items-center gap-2">
                  {z.nombre}
                  {cobraZona && <span className="cuerpo text-texto-suave">{formatQ(z.costo)}</span>}
                  {!z.activa && <Insignia>Desactivada</Insignia>}
                </p>
                <p className="cuerpo text-texto-suave">
                  {describirZona(z)} · {z.tiempo}
                </p>
              </div>
              <div className="flex gap-2">
                <Boton variante="secundario" tamano="sm" onClick={() => abrir(z)} aria-label={`Editar la zona ${z.nombre}`}>
                  Editar
                </Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => setBorrar(z)} aria-label={`Borrar la zona ${z.nombre}`}>
                  Borrar
                </Boton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando === "nueva" ? "Nueva zona de envío" : "Editar zona de envío"}>
        <form onSubmit={guardar} className="flex flex-col gap-4">
          <CampoTexto etiqueta="Nombre de la zona" autoComplete="off" maxLength={60} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <GrupoCasillas
            etiqueta="Departamentos"
            ayuda="Marque los que cubre esta zona. Sin ninguno, la zona es «el resto del país»."
            opciones={DEPARTAMENTOS.map((d) => ({ valor: d, texto: d }))}
            valores={form.departamentos}
            onCambio={(departamentos) => setForm({ ...form, departamentos, municipios: form.municipios.filter((m) => departamentos.some((d) => municipiosDe(d).includes(m))) })}
          />
          {form.departamentos.length > 0 && (
            <GrupoCasillas
              etiqueta="Solo algunos municipios (opcional)"
              ayuda="Si no marca ninguno, la zona cubre todos los municipios de esos departamentos."
              opciones={form.departamentos.flatMap((d) => municipiosDe(d).map((m) => ({ valor: m, texto: form.departamentos.length > 1 ? `${m} (${d})` : m })))}
              valores={form.municipios}
              onCambio={(municipios) => setForm({ ...form, municipios })}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {cobraZona && <CampoTexto etiqueta="Costo (Q)" inputMode="decimal" autoComplete="off" maxLength={12} value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} />}
            <CampoTexto etiqueta="Tiempo estimado" autoComplete="off" maxLength={60} ayuda="Por ejemplo: 1 a 2 días." value={form.tiempo} onChange={(e) => setForm({ ...form, tiempo: e.target.value })} />
          </div>
          <Casilla etiqueta="Zona activa" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
          {error && (
            <p role="alert" className="meta text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setEditando(null)}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={guardando}>
              Guardar
            </Boton>
          </div>
        </form>
      </Modal>

      <Modal abierto={!!tienda} onCerrar={() => setTienda(null)} titulo={`Dirección de ${tienda?.nombre ?? "la tienda"}`}>
        <form onSubmit={guardarTienda} className="flex flex-col gap-4">
          <AreaTexto etiqueta="Dirección" rows={3} maxLength={300} ayuda="Tal como la verá el cliente en el resumen del pedido." value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          {error && (
            <p role="alert" className="meta text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setTienda(null)}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={guardando}>
              Guardar
            </Boton>
          </div>
        </form>
      </Modal>

      <Modal abierto={!!borrar} onCerrar={() => setBorrar(null)} titulo="Borrar zona de envío">
        <p className="cuerpo mb-4">
          Se borrará la zona <strong>{borrar?.nombre}</strong>. Los pedidos ya hechos conservan su costo de envío.
        </p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setBorrar(null)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={confirmarBorrado}>
            Borrar zona
          </Boton>
        </div>
      </Modal>
    </section>
  );
}
