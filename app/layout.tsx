import type { Metadata } from "next";
import { Montserrat, Nunito_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: "700", variable: "--font-montserrat", display: "swap" });
const nunito = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: "Home Outlet",
  description: "Bandeja de mensajes, contactos y catálogo de Home Outlet Internacional.",
  robots: { index: false, follow: false }, // sistema privado: que ningún buscador lo indexe
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${montserrat.variable} ${nunito.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
