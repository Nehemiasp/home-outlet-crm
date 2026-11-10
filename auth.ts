import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { verificarClave, verificarSegundoFactor } from "@/lib/credenciales";
import { alIniciarSesion } from "@/lib/equipo/estado";
import { requiereSegundoFactor } from "@/lib/permisos";
import { recordadoEn } from "@/lib/recordar-equipo";
import { huellaDeClave } from "@/lib/sesion-vigente";

const entrada = z.object({ correo: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1).max(200), codigo: z.string().max(40).optional() });

export const { auth, signIn, signOut, handlers } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      async authorize(raw, request) {
        const datos = entrada.safeParse(raw);
        if (!datos.success) return null;
        const usuario = await verificarClave(datos.data.correo, datos.data.password);
        if (!usuario) return null;
        // Quien debe usar segundo factor y ya lo activó no entra sin el código (o un código de respaldo), salvo desde un equipo que lo
        // recuerda: la cookie firmada de lib/recordar-equipo.ts, para este usuario y esta IP, de menos de 30 días. Se comprueba aquí,
        // con la cookie y la IP de la petición, así nadie se lo salta mandando datos a mano. Quien todavía no lo activó entra
        // «a medias» (sf = false): la sesión solo le sirve para ir a activarlo (ver lib/session.ts).
        const exige = requiereSegundoFactor(usuario) && !!usuario.totpSecreto;
        const codigo = datos.data.codigo ?? "";
        if (exige && !(codigo ? await verificarSegundoFactor(usuario, codigo) : recordadoEn(request.headers, usuario))) return null;
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
