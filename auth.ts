import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { verificarClave, verificarSegundoFactor } from "@/lib/credenciales";
import { alIniciarSesion } from "@/lib/equipo/estado";
import { requiereSegundoFactor } from "@/lib/permisos";
import { huellaDeClave } from "@/lib/sesion-vigente";

const entrada = z.object({ correo: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1).max(200), codigo: z.string().max(40).optional() });

export const { auth, signIn, signOut, handlers } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      async authorize(raw) {
        const datos = entrada.safeParse(raw);
        if (!datos.success) return null;
        const usuario = await verificarClave(datos.data.correo, datos.data.password);
        if (!usuario) return null;
        // Quien debe usar segundo factor y ya lo activó no entra sin el código (o un código de respaldo). Quien todavía no lo activó entra
        // «a medias» (sf = false): la sesión solo le sirve para ir a activarlo (ver lib/session.ts).
        const exige = requiereSegundoFactor(usuario) && !!usuario.totpSecreto;
        if (exige && !(await verificarSegundoFactor(usuario, datos.data.codigo ?? ""))) return null;
        await alIniciarSesion(usuario.id); // el asesor queda Disponible al entrar
        return { id: usuario.id, name: usuario.nombre, email: usuario.correo, ph: huellaDeClave(usuario.passwordHash, usuario.totpSecreto), sf: exige } as { id: string; name: string; email: string };
      },
    }),
  ],
  // La huella de las credenciales y si se verificó el segundo factor viajan en la sesión (cifrada): ver lib/sesion-vigente.ts.
  // Sin los tipos de Auth.js a mano, se pasa con conversiones.
  callbacks: {
    jwt({ token, user }) {
      if (user) Object.assign(token, { ph: (user as { ph?: string }).ph, sf: (user as { sf?: boolean }).sf });
      return token;
    },
    session({ session, token }) {
      return Object.assign(session, { ph: (token as { ph?: string }).ph, sf: (token as { sf?: boolean }).sf });
    },
  },
});
