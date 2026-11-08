"use client";

import { Check, Copy, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Insignia } from "@/components/ui/etiquetas";
import { Boton, CampoTexto, Interruptor, Selector } from "@/components/ui/form";
import { MenuDesplegable, Modal, Tabla, type Columna } from "@/components/ui/estructura";
import { useToast } from "@/components/ui/toast";
import { NOMBRE_ROL, ROLES, veTodo, type Rol } from "@/lib/permisos";
import { cambiarActivo, cambiarPermisoVerificarPagos, cambiarRol, invitarUsuario, restablecerClave } from "../actions";

type Fila = { id: string; nombre: string; correo: string; rol: Rol; activo: boolean; puedeVerificarPagos: boolean };

/** La contraseña temporal se muestra una sola vez. */
function ClaveTemporal({ titulo, clave, onListo }: { titulo: string; clave: string; onListo: () => void }) {
  const [copiada, setCopiada] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
    } catch {
      // si el navegador no deja copiar, se puede seleccionar el texto a mano
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="cuerpo">{titulo}</p>
      <p className="rounded-campo border border-linea bg-fondo p-3 text-center font-mono text-lg tracking-wider select-all" aria-label="Contraseña temporal">
        {clave}
      </p>
      <p className="cuerpo rounded-campo bg-aviso-suave p-3 text-aviso">Cópiela ahora y entréguela por un medio seguro. No se vuelve a mostrar.</p>
      <div className="flex justify-end gap-2">
        <Boton variante="secundario" onClick={copiar}>
          {copiada ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copiada ? "Copiada" : "Copiar"}
        </Boton>
        <Boton onClick={onListo}>Listo</Boton>
      </div>
    </div>
  );
}

export function Usuarios({ usuarios, yoId }: { usuarios: Fila[]; yoId: string }) {
  const router = useRouter();
  const avisar = useToast();
  const [invitar, setInvitar] = useState(false);
  const [form, setForm] = useState({ nombre: "", correo: "", rol: "agente" });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [clave, setClave] = useState<{ titulo: string; valor: string } | null>(null);
  const [desactivar, setDesactivar] = useState<Fila | null>(null);

  const ejecutar = async (promesa: Promise<{ ok: boolean; error?: string }>, ok: string) => {
    const r = await promesa;
    if (r.ok) avisar(ok);
    else avisar(r.error ?? "No se pudo completar la acción.", "error");
    router.refresh();
  };

  const abrirInvitar = () => {
    setForm({ nombre: "", correo: "", rol: "agente" });
    setError("");
    setClave(null);
    setInvitar(true);
  };
  const enviarInvitacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    const r = await invitarUsuario(form as { nombre: string; correo: string; rol: Rol });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setClave({ titulo: `Se creó el usuario de ${form.nombre.trim()}. Esta es su contraseña temporal para entrar con ${form.correo.trim().toLowerCase()}:`, valor: r.clave });
    router.refresh();
  };
  const reiniciar = async (u: Fila) => {
    const r = await restablecerClave(u.id);
    if (!r.ok) return avisar(r.error, "error");
    setClave({ titulo: `Nueva contraseña temporal de ${u.nombre}. La anterior ya no sirve:`, valor: r.clave });
    setInvitar(true);
  };

  const columnas: Columna<Fila>[] = [
    {
      clave: "nombre",
      titulo: "Nombre",
      render: (u) => (
        <span className="cuerpo-fuerte whitespace-nowrap">
          {u.nombre}
          {u.id === yoId && <span className="meta ml-2 text-texto-suave">(usted)</span>}
        </span>
      ),
    },
    { clave: "correo", titulo: "Correo", render: (u) => u.correo },
    { clave: "rol", titulo: "Rol", render: (u) => NOMBRE_ROL[u.rol] },
    {
      clave: "pagos",
      titulo: "Verifica pagos",
      render: (u) =>
        veTodo(u) ? (
          <span className="meta text-texto-suave">Siempre</span>
        ) : u.rol === "bodega" ? (
          <span className="meta text-texto-suave">No aplica</span>
        ) : (
          <Interruptor etiquetaOculta etiqueta={`Permiso de verificar pagos de ${u.nombre}`} activo={u.puedeVerificarPagos} onCambio={(v) => void ejecutar(cambiarPermisoVerificarPagos(u.id, v), v ? `${u.nombre} ahora verifica pagos` : `${u.nombre} ya no verifica pagos`)} />
        ),
    },
    { clave: "estado", titulo: "Estado", render: (u) => <Insignia tono={u.activo ? "exito" : "gris"}>{u.activo ? "Activo" : "Desactivado"}</Insignia> },
    {
      clave: "acciones",
      titulo: "Acciones",
      render: (u) =>
        u.id === yoId ? (
          <span className="meta text-texto-suave">Es su usuario</span>
        ) : (
          <MenuDesplegable
            etiqueta="Acciones"
            opciones={[
              ...ROLES.filter((r) => r !== u.rol).map((r) => ({ texto: `Cambiar a ${NOMBRE_ROL[r].toLowerCase()}`, onElegir: () => ejecutar(cambiarRol(u.id, r), "Rol actualizado") })),
              { texto: "Restablecer contraseña", onElegir: () => reiniciar(u) },
              u.activo ? { texto: "Desactivar", peligro: true, onElegir: () => setDesactivar(u) } : { texto: "Activar", onElegir: () => ejecutar(cambiarActivo(u.id, true), "Usuario activado") },
            ]}
          />
        ),
    },
  ];

  return (
    <section aria-label="Usuarios" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="cuerpo max-w-xl text-texto-suave">Quién puede entrar al sistema. Al invitar a alguien se crea su usuario con una contraseña temporal que usted le entrega.</p>
        <Boton onClick={abrirInvitar}>
          <UserPlus className="size-4" aria-hidden />
          Invitar usuario
        </Boton>
      </div>
      <Tabla columnas={columnas} filas={usuarios} idFila={(u) => u.id} descripcion="Usuarios del sistema" pagina={1} totalPaginas={1} onPagina={() => {}} />

      <Modal abierto={invitar} onCerrar={() => setInvitar(false)} titulo={clave ? "Contraseña temporal" : "Invitar usuario"}>
        {clave ? (
          <ClaveTemporal titulo={clave.titulo} clave={clave.valor} onListo={() => setInvitar(false)} />
        ) : (
          <form onSubmit={enviarInvitacion} className="flex flex-col gap-4">
            <CampoTexto etiqueta="Nombre" autoComplete="off" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <CampoTexto etiqueta="Correo" type="email" autoComplete="off" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} />
            <Selector etiqueta="Rol" value={form.rol} onCambio={(v) => setForm({ ...form, rol: v })} opciones={[{ valor: "agente", texto: "Agente: atiende las conversaciones que le asignan" }, { valor: "jefe_tienda", texto: "Jefe de tienda: ve y gestiona todo, sin cambiar ajustes" }, { valor: "admin", texto: "Administrador: además gestiona ajustes, usuarios y canales" }, { valor: "bodega", texto: "Bodega: solo ve el catálogo y despacha los pedidos pagados" }]} />
            {error && (
              <p role="alert" className="meta text-error">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setInvitar(false)}>
                Cancelar
              </Boton>
              <Boton type="submit" cargando={enviando}>
                Crear usuario
              </Boton>
            </div>
          </form>
        )}
      </Modal>

      <Modal abierto={!!desactivar} onCerrar={() => setDesactivar(null)} titulo="Desactivar usuario">
        <p className="cuerpo mb-4">
          <strong>{desactivar?.nombre}</strong> no podrá entrar al sistema y sus conversaciones asignadas quedarán sin asignar. Sus mensajes y notas se conservan. Puede activarlo de nuevo cuando quiera.
        </p>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setDesactivar(null)}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            onClick={() => {
              const u = desactivar;
              setDesactivar(null);
              if (u) void ejecutar(cambiarActivo(u.id, false), "Usuario desactivado");
            }}
          >
            Desactivar
          </Boton>
        </div>
      </Modal>
    </section>
  );
}
