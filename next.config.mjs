/** @type {import("next").NextConfig} */
// Sin funciones exclusivas de un proveedor: el proyecto debe poder alojarse en cualquier lado.
const nextConfig = {
  // Para abrir el sistema desde otro equipo o por la dirección de red en desarrollo (si no, Next bloquea sus archivos y la página no responde).
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "*.local"],
  experimental: { serverActions: { bodySizeLimit: "6mb" } }, // fotos de hasta 5 MB
  devIndicators: false, // la insignia de desarrollo tapaba "Salir" y "Enviar"
};
export default nextConfig;
