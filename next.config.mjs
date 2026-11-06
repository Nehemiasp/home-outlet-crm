// Cabeceras de seguridad para todas las rutas. Sin `script-src` a propósito: Next necesita scripts en línea para hidratar,
// y una política con 'unsafe-inline' no protege; lo que sí cierra esta política es que otro sitio nos enmarque, cambie la
// base de las rutas o reciba formularios nuestros. HSTS solo en producción (en desarrollo no hay https).
const seguridad = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000" }] : []),
];

/** @type {import("next").NextConfig} */
// Sin funciones exclusivas de un proveedor: el proyecto debe poder alojarse en cualquier lado.
const nextConfig = {
  // Para abrir el sistema desde otro equipo o por la dirección de red en desarrollo (si no, Next bloquea sus archivos y la página no responde).
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "*.local"],
  experimental: { serverActions: { bodySizeLimit: "6mb" } }, // fotos de hasta 5 MB
  devIndicators: false, // la insignia de desarrollo tapaba "Salir" y "Enviar"
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: seguridad }];
  },
};
export default nextConfig;
