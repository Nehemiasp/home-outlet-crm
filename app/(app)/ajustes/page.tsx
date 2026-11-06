import { redirect } from "next/navigation";
import { evaluarPrimerosPasos } from "@/lib/primeros-pasos";

// Mientras falten pasos para trabajar con datos reales, Ajustes abre en «Primeros pasos»; después, en Usuarios.
export default async function Ajustes() {
  const pendientes = (await evaluarPrimerosPasos()).some((p) => !p.hecho);
  redirect(pendientes ? "/ajustes/primeros-pasos" : "/ajustes/usuarios");
}
