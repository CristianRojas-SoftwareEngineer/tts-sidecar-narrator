// Normalización del texto para voz: convierte texto potencialmente con markdown,
// código y símbolos en texto plano apto para leerse en voz alta. Se aplica tanto
// a la salida del LLM (los modelos free no siempre obedecen el formato) como al
// constructor local. Basado en normalize-speech-text del Orchestrator (§4 fila
// 11) y SIN truncamiento de oraciones, pero con una desviación deliberada del
// producto: paréntesis, comillas y guiones se CONSERVAN (no mutilar la frase;
// si molestan al leerse, se eliminan después).

/** Limpia markdown/código/símbolos y colapsa espacios. No recorta oraciones. */
export function toPlainText(input: string): string {
  let t = input ?? "";

  // Bloques de código cercados: se quitan los delimitadores pero se conserva
  // el contenido (rutas/nombres de archivo deben pronunciarse).
  t = t.replace(/```([\s\S]*?)```/g, "$1");
  t = t.replace(/~~~([\s\S]*?)~~~/g, "$1");
  // Código en línea: se quitan las comillas invertidas, conservando el texto.
  t = t.replace(/`([^`]*)`/g, "$1");
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
  // acentos/ñ/ü, puntuación básica del español, paréntesis, comillas y guiones
  // (decisión del producto: se conservan para no mutilar la frase; si molestan
  // al leerse, se eliminan después).
  t = t.replace(/[^\p{L}\p{N}\s.,;:¿?¡!()'"-]/gu, " ");
  // Colapsar espacios y saltos de línea.
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

/**
 * Pipeline completo para voz: texto plano, sin truncar (fidelidad a lo probado
 * en el Orchestrator). Devuelve "" si no queda nada utilizable.
 */
export function sanitizeForSpeech(input: string): string {
  const plain = toPlainText(input);
  return plain ? plain.replace(/\s+/g, " ").trim() : "";
}
