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
 * Mapea la lista de mensajes a la estructura que reciben los providers,
 * preservando los roles (§3.3 del plan de migración). Reglas:
 * - `system` se aplana a `user` con prefijo `[Sistema]: ` (ni Gemini `contents`
 *   ni Anthropic `messages` aceptan rol `system` dentro del array; el prefijo
 *   conserva el significado, igual que en el Orchestrator).
 * - `assistant`/`user` se conservan tal cual.
 * - Si el último mensaje no es `user`, se anexa `¿Qué pasó en este turno?`.
 */
export function buildUserContent(messages: SessionMessage[]): SessionMessage[] {
  const out: SessionMessage[] = messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) =>
      m.role === "system"
        ? { role: "user", content: `[Sistema]: ${m.content}` }
        : m,
    );
  if (out.length > 0 && out[out.length - 1].role !== "user") {
    out.push({ role: "user", content: "¿Qué pasó en este turno?" });
  }
  return out;
}
