import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Segundo factor: el código de 6 dígitos de una aplicación de autenticación (TOTP, RFC 6238: HMAC-SHA1, intervalos de 30 s).
 * Esta parte no toca la base ni el servidor: solo cálculo, para poder probarla con los vectores oficiales del estándar.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const PASO_SEGUNDOS = 30;
export const DIGITOS = 6;

export function aBase32(b: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = "";
  for (const byte of b) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += BASE32[(valor << (5 - bits)) & 31];
  return salida;
}

export function deBase32(s: string): Buffer {
  const limpio = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpio) {
    valor = (valor << 5) | BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Un secreto nuevo de 160 bits (lo que recomienda el estándar), en base 32 para teclearlo o escanearlo. */
export const nuevoSecreto = () => aBase32(randomBytes(20));

function hotp(secreto: Buffer, contador: number): string {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(contador));
  const h = createHmac("sha1", secreto).update(c).digest();
  const o = h[19]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 10 ** DIGITOS).padStart(DIGITOS, "0");
}

/** El intervalo de 30 s al que pertenece un instante. */
export const pasoDe = (ms = Date.now()) => Math.floor(ms / 1000 / PASO_SEGUNDOS);

export const codigoTotp = (secreto: string, paso: number) => hotp(deBase32(secreto), paso);

/**
 * ¿El código es correcto? Se aceptan el intervalo actual y uno antes y uno después (relojes algo distintos), pero solo si es MÁS NUEVO
 * que el último ya usado: un mismo código no sirve dos veces. Devuelve el intervalo que acertó (para guardarlo) o null.
 */
export function verificarTotp(secreto: string, codigo: string, ultimoPaso: number, ms = Date.now()): number | null {
  const recibido = codigo.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(recibido)) return null;
  const clave = deBase32(secreto);
  const ahora = pasoDe(ms);
  let acierto: number | null = null;
  for (const paso of [ahora - 1, ahora, ahora + 1]) {
    // Se revisan los tres siempre, y con comparación de tiempo constante: el tiempo no dice cuál estuvo cerca.
    const bueno = timingSafeEqual(Buffer.from(hotp(clave, paso)), Buffer.from(recibido));
    if (bueno && paso > ultimoPaso && acierto === null) acierto = paso;
  }
  return acierto;
}

/** La dirección que lee la aplicación de autenticación (el contenido del QR). */
export const uriOtpauth = (secreto: string, correo: string, emisor = "Home Outlet") =>
  `otpauth://totp/${encodeURIComponent(emisor)}:${encodeURIComponent(correo)}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASO_SEGUNDOS}`;

/** El secreto en grupos de 4 para teclearlo a mano: «ABCD EFGH …». */
export const secretoEnGrupos = (secreto: string) => secreto.match(/.{1,4}/g)?.join(" ") ?? secreto;

/* ── Secreto guardado cifrado: si alguien copia la base de datos, sin AUTH_SECRET no le sirve ── */
function claveDeCifrado(): Buffer {
  const base = process.env.AUTH_SECRET;
  if (!base) throw new Error("Falta AUTH_SECRET: sin él no se puede guardar el segundo factor.");
  return Buffer.from(hkdfSync("sha256", base, "home-outlet", "segundo-factor", 32));
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", claveDeCifrado(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString("base64")).join(".");
}

/** null si el texto está dañado o se cifró con otro AUTH_SECRET. */
export function descifrar(guardado: string): string | null {
  try {
    const [iv, etiqueta, datos] = guardado.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", claveDeCifrado(), iv!);
    d.setAuthTag(etiqueta!);
    return Buffer.concat([d.update(datos!), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/* ── Códigos de respaldo (de un solo uso), para quien pierda el teléfono ── */
const ALFABETO_RESPALDO = "abcdefghjkmnpqrstuvwxyz23456789"; // sin letras que se confunden (i, l, o) ni 0, 1
const bloque = () => Array.from({ length: 5 }, () => ALFABETO_RESPALDO[randomInt(ALFABETO_RESPALDO.length)]).join("");

/** `cuantos` códigos como «k3m9x-q7vbn» (unos 50 bits cada uno). Se muestran una sola vez; en la base queda solo su huella. */
export const nuevosRespaldos = (cuantos = 8) => Array.from({ length: cuantos }, () => `${bloque()}-${bloque()}`);

/** La huella con que se guarda y se busca un código de respaldo (sin importar mayúsculas, espacios ni el guion). */
export const huellaRespaldo = (codigo: string) => createHash("sha256").update(codigo.toLowerCase().replace(/[\s-]/g, "")).digest("hex");

/** ¿Tiene forma de código de respaldo? (10 letras o números, con o sin guion). */
export const pareceRespaldo = (codigo: string) => /^[a-z0-9]{5}-?[a-z0-9]{5}$/i.test(codigo.trim());

/** Lo que ve quien se equivoca en el segundo paso: no se dice si falló el código de la aplicación o el de respaldo. */
export const MENSAJE_CODIGO_MALO = "El código no es correcto o ya se usó. Espere al siguiente código de su aplicación, o use un código de respaldo.";
