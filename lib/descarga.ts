/** Descarga una tabla como CSV (con BOM, para que Excel respete las tildes). Solo se usa en el navegador. */
export function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const celda = (v: string | number) => {
    const t = String(v);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const contenido = "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
