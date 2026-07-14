// Composición genérica primario → fallback de proveedores de texto. Cualquier
// fallo (sin key, HTTP >= 400 incluido 429, timeout, respuesta vacía) pasa al
// siguiente nivel. La cadena de LLMs puede fallar entera: el modo local (fuera
// de esta cadena, en build-message) garantiza que siempre haya algo que narrar.
import type { GenerationMode } from "./prompts.js";

export interface GenerationInput {
  mode: GenerationMode;
  /** Fuente primaria: last_assistant_message del payload. */
  text: string;
  /** Enriquecimiento opcional: últimos mensajes del transcript. */
  transcript: string[];
}

export interface TextProvider {
  readonly name: string;
  /** Devuelve el texto generado; lanza ante cualquier fallo. */
  generate(input: GenerationInput): Promise<string>;
}

/** Timeout por request; una locución que llega tarde ya no es conversacional. */
export const REQUEST_TIMEOUT_MS = 8000;
export const MAX_OUTPUT_TOKENS = 512;

/**
 * Recorre los proveedores en orden y devuelve el primer texto no vacío. Si todos
 * fallan, devuelve undefined (el llamante degrada al constructor local).
 */
export async function runChain(
  providers: TextProvider[],
  input: GenerationInput,
): Promise<string | undefined> {
  for (const provider of providers) {
    try {
      const text = (await provider.generate(input)).trim();
      if (text) return text;
    } catch {
      // Siguiente nivel.
    }
  }
  return undefined;
}

/** Construye el prompt de usuario combinando transcript (contexto) + texto primario. */
export function buildUserContent(input: GenerationInput): string {
  const parts: string[] = [];
  if (input.transcript.length > 0) {
    parts.push("Contexto reciente de la conversación:");
    parts.push(input.transcript.join("\n"));
    parts.push("");
  }
  parts.push("Último mensaje del asistente en este turno:");
  parts.push(input.text);
  return parts.join("\n");
}
