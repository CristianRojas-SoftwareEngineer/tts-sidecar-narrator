// Composición genérica primario → fallback de proveedores de texto. Cualquier
// fallo (sin key, HTTP >= 400 incluido 429, timeout, respuesta vacía) pasa al
// siguiente nivel. La cadena de LLMs puede fallar entera: el modo local (fuera
// de esta cadena, en build-message) garantiza que siempre haya algo que narrar.
import type { GenerationMode } from "./prompts.js";

/** Mensaje estructurado del transcript/conversación, con rol preservado. */
export interface SessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface GenerationInput {
  mode: GenerationMode;
  /** Fuente primaria: last_assistant_message del payload (fallback local). */
  text: string;
  /** Enriquecimiento: últimos mensajes del transcript con rol preservado. */
  messages: SessionMessage[];
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

/**
 * Mapea y prepara la lista de mensajes final para los proveedores LLM,
 * incorporando el texto primario del input y el historial del transcript,
 * preservando los roles y aplicando las reglas del modo (summary).
 */
export function buildUserContent(input: GenerationInput): SessionMessage[] {
  const { mode, text, messages } = input;
  const trimmedText = (text ?? "").trim();

  const history: SessionMessage[] = (messages ?? [])
    .filter((m) => m && m.content && m.content.trim().length > 0)
    .map((m) =>
      m.role === "system"
        ? { role: "user", content: `[Sistema]: ${m.content.trim()}` }
        : { role: m.role, content: m.content.trim() },
    );

  if (mode === "summary") {
    if (trimmedText) {
      const last = history.length > 0 ? history[history.length - 1] : undefined;
      if (!last || last.role !== "assistant" || last.content !== trimmedText) {
        history.push({ role: "assistant", content: trimmedText });
      }
    }
    if (history.length > 0 && history[history.length - 1].role !== "user") {
      history.push({
        role: "user",
        content: "Cuéntame en voz alta en primera persona y de forma técnica qué lograste avanzar.",
      });
    }
    return history;
  }

  return history;
}
