"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Gráficas del sistema de diseño, dibujadas en SVG con los colores de los tokens.
 * Cada una lleva título, unidades y un texto equivalente para lectores de pantalla (`resumen`).
 * El SVG se dibuja a su tamaño real (1 unidad = 1 px), así las etiquetas de los ejes miden 12 px en cualquier pantalla.
 */

export type Serie = { nombre: string; color: string; valores: number[] };

/** Un color fijo por canal, igual en todas las gráficas y leyendas. «Simulado» usa el de «Otros». */
export const COLOR_CANAL = {
  whatsapp: "var(--canal-whatsapp)",
  tiktok: "var(--canal-tiktok)",
  instagram: "var(--canal-instagram)",
  facebook: "var(--canal-facebook)",
  simulado: "var(--canal-otros)",
  otros: "var(--canal-otros)",
} as const;

const TAM_ETIQUETA = 12;
const ANCHO_INICIAL = 720;

/** Ancho real del contenedor; antes de medir (y en el servidor) usa 720. */
function useAncho() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(ANCHO_INICIAL);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(240, Math.round(el.clientWidth)));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/** Techo "redondo" para el eje (1, 2, 5, 10, 20, 50…), sirve igual para unidades y para centavos de dólar. */
function escalaLimpia(max: number) {
  if (max <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(max));
  const f = max / base;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * base;
}

const formatoEjeBase = (v: number) => (Number.isInteger(v) ? String(v) : v < 1 ? v.toFixed(3).replace(/0+$/, "") : v.toFixed(1));

/** Las tres marcas del eje Y (0, mitad y máximo) y el margen izquierdo que necesitan sus textos. */
function ejeY(max: number, formato: (n: number) => string = formatoEjeBase) {
  const marcas = [0, 0.5, 1].map((p) => ({ p, texto: formato(max * p) }));
  const margenIzq = Math.max(40, Math.ceil(Math.max(...marcas.map((m) => m.texto.length)) * 7 + 12));
  return { marcas, margenIzq };
}

function EjeY({ marcas, alto, margenIzq, margenSup, ancho }: { marcas: { p: number; texto: string }[]; alto: number; margenIzq: number; margenSup: number; ancho: number }) {
  return (
    <g fontSize={TAM_ETIQUETA} fill="var(--texto-suave)">
      {marcas.map((m) => {
        const y = margenSup + alto - alto * m.p;
        return (
          <g key={m.p}>
            <line x1={margenIzq} x2={ancho - 8} y1={y} y2={y} stroke="var(--linea)" />
            <text x={margenIzq - 6} y={y + 4} textAnchor="end">
              {m.texto}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Marco común: título, unidad, leyenda y texto para lectores de pantalla. */
export function Figura({ titulo, unidad, resumen, leyenda, children, className }: { titulo: string; unidad?: string; resumen: string; leyenda?: { nombre: string; color: string; total?: string }[]; children: React.ReactNode; className?: string }) {
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="cuerpo-fuerte">{titulo}</span>
        {unidad && <span className="meta text-texto-suave">{unidad}</span>}
      </figcaption>
      {leyenda && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {leyenda.map((l) => (
            <li key={l.nombre} className="meta flex items-center gap-1 text-texto">
              <span aria-hidden className="size-3 rounded-campo" style={{ background: l.color }} />
              {l.nombre}
              {l.total !== undefined && <span className="text-texto-suave">· {l.total}</span>}
            </li>
          ))}
        </ul>
      )}
      <div aria-hidden>{children}</div>
      <p className="sr-only">{resumen}</p>
    </figure>
  );
}

/** Barras verticales, apiladas si hay más de una serie (1 px de superficie separa los segmentos). `formato` también rotula el eje. */
export function BarrasApiladas({ etiquetas, series, unidad, titulo, resumen, formato = (n) => String(n), destacarMaximo }: { etiquetas: string[]; series: Serie[]; unidad?: string; titulo: string; resumen: string; formato?: (n: number) => string; /** Con una sola serie, la barra más alta va en naranja. */ destacarMaximo?: boolean }) {
  const [ref, ancho] = useAncho();
  const alto = 200;
  const n = Math.max(1, etiquetas.length);
  const totales = etiquetas.map((_, i) => series.reduce((s, x) => s + (x.valores[i] ?? 0), 0));
  const maxRedondo = escalaLimpia(Math.max(0, ...totales));
  const mayor = Math.max(0, ...totales);
  const eje = ejeY(maxRedondo, formato);
  const margen = { izq: eje.margenIzq, sup: 8, inf: 26 };
  const paso = (ancho - margen.izq - 8) / n;
  const anchoBarra = Math.max(2, paso * 0.72);
  const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((ancho - margen.izq) / 64))));

  return (
    <Figura titulo={titulo} unidad={unidad} resumen={resumen} leyenda={series.length > 1 ? series.map((s) => ({ nombre: s.nombre, color: s.color, total: formato(s.valores.reduce((a, b) => a + b, 0)) })) : undefined}>
      <div ref={ref} className="w-full">
        <svg width={ancho} height={alto + margen.sup + margen.inf} viewBox={`0 0 ${ancho} ${alto + margen.sup + margen.inf}`} className="block max-w-full">
          <EjeY marcas={eje.marcas} alto={alto} margenIzq={margen.izq} margenSup={margen.sup} ancho={ancho} />
          {etiquetas.map((et, i) => {
            let acumulado = 0;
            const x = margen.izq + paso * i + (paso - anchoBarra) / 2;
            return (
              <g key={`${et}-${i}`}>
                {series.map((s) => {
                  const v = s.valores[i] ?? 0;
                  const h = (v / maxRedondo) * alto;
                  const y = margen.sup + alto - acumulado - h;
                  acumulado += h;
                  return v > 0 ? (
                    <rect key={s.nombre} x={x} y={y} width={anchoBarra} height={h} fill={destacarMaximo && series.length === 1 && v === mayor ? "var(--naranja)" : s.color} stroke={series.length > 1 ? "var(--superficie)" : undefined} strokeWidth={series.length > 1 ? 1 : undefined}>
                      <title>{`${et} · ${s.nombre}: ${formato(v)}`}</title>
                    </rect>
                  ) : null;
                })}
                {i % cada === 0 && (
                  <text x={x + anchoBarra / 2} y={alto + margen.sup + 17} textAnchor="middle" fontSize={TAM_ETIQUETA} fill="var(--texto-suave)">
                    {et}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </Figura>
  );
}

/** Barras horizontales con el valor al lado: se leen bien en el teléfono y no necesitan ejes. */
export function BarrasHorizontales({ datos, titulo, unidad, resumen, color = "var(--carbon)", destacarMaximo }: { datos: { etiqueta: string; valor: number }[]; titulo: string; unidad?: string; resumen: string; color?: string; /** La barra más larga va en naranja. */ destacarMaximo?: boolean }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <Figura titulo={titulo} unidad={unidad} resumen={resumen}>
      <ul className="flex flex-col gap-1">
        {datos.slice(0, 10).map((d) => (
          <li key={d.etiqueta} className="grid h-5 grid-cols-[7rem_1fr_3rem] items-center gap-2 sm:grid-cols-[9rem_1fr_3.5rem]">
            <span className="meta truncate text-texto" title={d.etiqueta}>{d.etiqueta}</span>
            <span className="h-4 rounded-campo bg-fondo">
              <span className="block h-full rounded-campo" style={{ width: `${(d.valor / max) * 100}%`, background: destacarMaximo && d.valor === max ? "var(--naranja)" : color }} />
            </span>
            <span className="meta text-right tabular-nums text-texto">{d.valor}</span>
          </li>
        ))}
      </ul>
    </Figura>
  );
}

const usd = (n: number) => `US$ ${n.toFixed(2)}`;

/** Línea acumulada con una línea de límite (el presupuesto). Los costos van en dólares: «US$ 0.50». */
export function LineaAcumulada({ etiquetas, valores, limite, titulo, unidad, resumen, nombreLimite = "Presupuesto" }: { etiquetas: string[]; valores: number[]; limite: number; titulo: string; unidad?: string; resumen: string; nombreLimite?: string }) {
  const [ref, ancho] = useAncho();
  const alto = 200;
  const max = Math.max(limite, ...valores) * 1.1 || 1;
  const eje = ejeY(max, usd);
  const margen = { izq: eje.margenIzq, sup: 8, inf: 26 };
  const n = Math.max(2, etiquetas.length);
  const x = (i: number) => margen.izq + ((ancho - margen.izq - 12) * i) / (n - 1);
  const y = (v: number) => margen.sup + alto - (v / max) * alto;
  const puntos = valores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((ancho - margen.izq) / 64))));
  const final = valores.at(-1) ?? 0;

  return (
    <Figura titulo={titulo} unidad={unidad} resumen={resumen} leyenda={[{ nombre: "Gasto acumulado", color: "var(--carbon)" }, { nombre: nombreLimite, color: "var(--error)" }]}>
      <div ref={ref} className="w-full">
        <svg width={ancho} height={alto + margen.sup + margen.inf} viewBox={`0 0 ${ancho} ${alto + margen.sup + margen.inf}`} className="block max-w-full">
          <EjeY marcas={eje.marcas} alto={alto} margenIzq={margen.izq} margenSup={margen.sup} ancho={ancho} />
          <line x1={margen.izq} x2={ancho - 8} y1={y(limite)} y2={y(limite)} stroke="var(--error)" strokeWidth="2" strokeDasharray="6 4" />
          {valores.length > 1 && <polyline points={puntos} fill="none" stroke="var(--carbon)" strokeWidth="2.5" strokeLinejoin="round" />}
          {valores.length > 0 && (
            <circle cx={x(valores.length - 1)} cy={y(final)} r="4" fill="var(--carbon)">
              <title>{`${etiquetas.at(-1)}: ${usd(final)}`}</title>
            </circle>
          )}
          {etiquetas.map((et, i) =>
            i % cada === 0 ? (
              <text key={`${et}-${i}`} x={x(i)} y={alto + margen.sup + 17} textAnchor="middle" fontSize={TAM_ETIQUETA} fill="var(--texto-suave)">
                {et}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </Figura>
  );
}

/** Tarjeta KPI: etiqueta, número grande y una línea de contexto. `alerta` pinta el número de aviso. */
export function TarjetaKPI({ etiqueta, valor, contexto, alerta }: { etiqueta: string; valor: React.ReactNode; contexto?: React.ReactNode; alerta?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-tarjeta border border-linea bg-superficie p-4">
      <p className="meta text-texto-suave">{etiqueta}</p>
      <p className={cn("numero-kpi", alerta && "text-estado-aviso-texto")}>{valor}</p>
      {contexto && <div className="meta truncate text-texto-suave">{contexto}</div>}
    </div>
  );
}
