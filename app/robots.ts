import type { MetadataRoute } from "next";

// Sistema privado: se le pide a todos los buscadores que no lo recorran ni lo indexen.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
