import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/lib/db";
import { alIniciarSesion } from "@/lib/equipo/estado";

const entrada = z.object({ correo: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1).max(200) });

// Se compara contra un hash falso cuando el correo no existe, para que la respuesta tarde igual
// y no se pueda saber si el correo está registrado.
const HASH_FALSO = bcrypt.hashSync("no-es-una-clave", 10);

export const { auth, signIn, signOut, handlers } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      async authorize(raw) {
        const datos = entrada.safeParse(raw);
        if (!datos.success) return null;
        const usuario = await db.user.findUnique({ where: { correo: datos.data.correo } });
        const ok = await bcrypt.compare(datos.data.password, usuario?.passwordHash ?? HASH_FALSO);
        if (!usuario || !usuario.activo || !ok) return null;
        await alIniciarSesion(usuario.id); // el asesor queda Disponible al entrar
        return { id: usuario.id, name: usuario.nombre, email: usuario.correo };
      },
    }),
  ],
});
