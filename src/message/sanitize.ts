// Normalización del texto para voz: convierte texto potencialmente con markdown,
// código y símbolos en texto plano apto para leerse en voz alta. Se aplica tanto
// a la salida del LLM (los modelos free no siempre obedecen el formato) como al
// constructor local.

const MAX_CHARS = 320;

/** Limpia markdown/código/símbolos y colapsa espacios. No recorta oraciones. */
export function toPlainText(input: string): string {
  let t = input ?? "";

  // Bloques de código cercados y su contenido.
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/~~~[\s\S]*?~~~/g, " ");
  // Código en línea.
  t = t.replace(/`[^`]*`/g, " ");
  // Enlaces markdown [texto](url) → texto; imágenes ![alt](url) → alt.
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  // URLs sueltas.
  t = t.replace(/https?:\/\/\S+/g, " ");
  // Encabezados, citas y viñetas al inicio de línea.
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/^\s{0,3}>\s?/gm, "");
  t = t.replace(/^\s{0,3}[-*+]\s+/gm, "");
  t = t.replace(/^\s{0,3}\d+[.)]\s+/gm, "");
  // Énfasis y tachado.
  t = t.replace(/[*_~]{1,3}/g, "");
  // Símbolos que no se leen bien; se conservan letras, dígitos, espacios,
  // acentos/ñ/ü y puntuación básica del español.
  t = t.replace(/[^\p{L}\p{N}\s.,;:¿?¡!()'"-]/gu, " ");
  // Colapsar espacios y saltos de línea.
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

/** Devuelve las primeras `max` oraciones del texto plano. */
export function firstSentences(text: string, max = 2): string {
  const parts = text.match(/[^.!?]+[.!?]*/g);
  if (!parts) return text;
  return parts
    .slice(0, max)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pipeline completo para voz: texto plano → primeras 1-2 oraciones → recorte a
 * un largo narrable. Devuelve "" si no queda nada utilizable.
 */
export function sanitizeForSpeech(input: string, maxSentences = 2): string {
  const plain = toPlainText(input);
  if (!plain) return "";
  let out = firstSentences(plain, maxSentences);
  if (out.length > MAX_CHARS) {
    out = out.slice(0, MAX_CHARS).replace(/\s+\S*$/, "").trim();
  }
  return out;
}
