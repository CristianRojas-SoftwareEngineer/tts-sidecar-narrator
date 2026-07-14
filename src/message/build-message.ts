// Orquestador del subsistema de mensajes: payload → texto a narrar. Siempre
// resuelve (nunca lanza). Degradación: cadena LLM (solo modo summary y con keys)
// → resumen local determinista → texto estático por evento. El modo notice
// (Notification) no usa LLM.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import type { Config } from "../lib/config.js";
import type { HookPayload } from "../lib/hook-payload.js";
import { runChain, type GenerationInput, type TextProvider } from "./provider-chain.js";
import { GeminiProvider } from "./gemini-provider.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import { buildLocalSummary, buildNotice, staticForEvent } from "./local-builder.js";
import { sanitizeForSpeech } from "./sanitize.js";

const TRANSCRIPT_TAIL_MESSAGES = 3;
const TRANSCRIPT_TAIL_BYTES = 256 * 1024;

/** Punto de entrada del subsistema. Devuelve el texto listo para `speak`. */
export async function buildMessage(payload: HookPayload, cfg: Config): Promise<string> {
  const event = payload.hook_event_name;

  // Modo notice: sin LLM, el mensaje ya viene redactado.
  if (event === "Notification") {
    return buildNotice(payload.message);
  }

  // Modo summary (Stop y cualquier otro evento con texto del asistente).
  const primary = (payload.last_assistant_message ?? "").trim();

  if (cfg.messageMode === "llm") {
    const providers = buildProviders(cfg);
    if (providers.length > 0) {
      const input: GenerationInput = {
        mode: "summary",
        text: primary,
        transcript: readTranscriptTail(payload.transcript_path),
      };
      const llm = await runChain(providers, input);
      if (llm) {
        const clean = sanitizeForSpeech(llm);
        if (clean) return clean;
      }
    }
  }

  // Degradación local: resumen determinista del texto primario.
  const localSummary = buildLocalSummary(primary);
  if (localSummary) return localSummary;

  // Último recurso: estático por evento.
  return staticForEvent(event);
}

/** Providers en orden de prioridad; se omite el que no tenga key. */
function buildProviders(cfg: Config): TextProvider[] {
  const providers: TextProvider[] = [];
  if (cfg.geminiApiKey) providers.push(new GeminiProvider(cfg.geminiApiKey));
  if (cfg.openRouterApiKey) providers.push(new OpenRouterProvider(cfg.openRouterApiKey));
  return providers;
}

/**
 * Lee los últimos mensajes del transcript JSONL como enriquecimiento opcional.
 * Best-effort: cualquier fallo devuelve []. Solo lee la cola del archivo para
 * acotar el I/O; descarta líneas malformadas.
 */
function readTranscriptTail(transcriptPath: string | undefined): string[] {
  if (!transcriptPath) return [];
  let fd: number | undefined;
  try {
    const size = statSync(transcriptPath).size;
    const start = Math.max(0, size - TRANSCRIPT_TAIL_BYTES);
    const length = size - start;
    if (length <= 0) return [];
    const buf = Buffer.alloc(length);
    fd = openSync(transcriptPath, "r");
    readSync(fd, buf, 0, length, start);
    const chunk = buf.toString("utf8");

    // Si no leímos desde el inicio, la primera línea puede estar cortada.
    const lines = chunk.split("\n");
    if (start > 0) lines.shift();

    const messages: string[] = [];
    for (const line of lines) {
      const entry = extractMessage(line);
      if (entry) messages.push(entry);
    }
    return messages.slice(-TRANSCRIPT_TAIL_MESSAGES);
  } catch {
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignorar
      }
    }
  }
}

/** Extrae "rol: texto" de una línea JSONL del transcript, o null si no aplica. */
function extractMessage(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as {
      type?: string;
      role?: string;
      message?: { role?: string; content?: unknown };
    };
    const role = obj.message?.role ?? obj.role ?? obj.type;
    if (role !== "user" && role !== "assistant") return null;

    const text = extractText(obj.message?.content);
    if (!text) return null;

    const label = role === "user" ? "usuario" : "asistente";
    return `${label}: ${text}`;
  } catch {
    return null;
  }
}

/** Aplana el content (string o array de bloques) a texto plano. */
function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string"
          ? (b as { text: string }).text
          : "",
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}
