// Topes de tamaño deterministas y puros para las dos rutas del subsistema:
// `clampHead` acota el input al LLM (conserva la cabeza) y `clampSentences`
// acota la degradación local (oraciones completas). Ninguna función tiene
// efectos secundarios ni depende del reloj: mismo input → mismo output.
// `sanitizeForSpeech` NO se toca (su contrato heredado «sin truncamiento» se
// conserva; el corte es responsabilidad de quien lo necesita).

/** Tope generoso del input al LLM (~4k tokens): protege timeout y cuota. */
export const LLM_INPUT_MAX_CHARS = 16000;

/** Tope corto de la degradación local (~30 s de locución a ritmo TTS español). */
export const LOCAL_SPEECH_MAX_CHARS = 400;

/** Terminadores de oración reconocidos por `clampSentences`. */
const SENTENCE_TERMINATORS = new Set([".", "!", "?", "…"]);

/**
 * Conserva la CABEZA del texto hasta `LLM_INPUT_MAX_CHARS`, cortando en el
 * último límite de párrafo (`\n\n`) por debajo del tope; si no hay párrafo,
 * retrocede al último límite de palabra. Nunca corta a mitad de palabra.
 * Devuelve el texto tal cual si ya cabe; texto vacío → "".
 */
export function clampHead(text: string): string {
  const t = text ?? "";
  if (t.length <= LLM_INPUT_MAX_CHARS) return t;

  const window = t.slice(0, LLM_INPUT_MAX_CHARS);

  // Preferir el último límite de párrafo dentro de la ventana.
  const lastPara = window.lastIndexOf("\n\n");
  if (lastPara > 0) return window.slice(0, lastPara).trimEnd();

  // Sin párrafo: retroceder al último límite de palabra (espacio).
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace > 0) return window.slice(0, lastSpace).trimEnd();

  // Palabra única más larga que el tope: corte duro.
  return window;
}

/**
 * Acumula ORACIONES COMPLETAS (terminadores `.`, `!`, `?`, `…`) mientras la
 * suma no exceda `maxChars`. Si la primera oración ya excede el tope, corta en
 * el último límite de palabra (sin puntos suspensivos, no se pronuncian).
 * Puro y determinista; texto vacío → "".
 */
export function clampSentences(text: string, maxChars: number): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;

  const sentences = splitSentences(t);

  let acc = "";
  for (const sentence of sentences) {
    const next = acc ? `${acc} ${sentence}` : sentence;
    if (next.length > maxChars) break;
    acc = next;
  }

  if (acc) return acc;

  // La primera oración ya excede el tope: cortar en límite de palabra.
  const window = t.slice(0, maxChars);
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace > 0) return window.slice(0, lastSpace).trimEnd();
  return window;
}

/** Divide en oraciones completas conservando su terminador y espaciado normal. */
function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (SENTENCE_TERMINATORS.has(text[i])) {
      // Consumir terminadores consecutivos (p. ej. "?!" o "...").
      let end = i + 1;
      while (end < text.length && SENTENCE_TERMINATORS.has(text[end])) end++;
      const sentence = text.slice(start, end).trim();
      if (sentence) sentences.push(sentence);
      start = end;
      i = end - 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}
