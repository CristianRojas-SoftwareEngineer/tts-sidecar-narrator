// Orquestador del subsistema de mensajes: payload → petición de narración
// (`say` con texto dinámico o `play` de un aviso pre-sintetizado). Siempre
// resuelve (nunca lanza). Degradación: cadena LLM (solo modo summary y con keys)
// → resumen local determinista → aviso estático pre-sintetizado por evento.
// El modo notice (Notification) no usa LLM. UserPromptSubmit es un acuse fijo:
// reproduce su aviso horneado, sin LLM ni resumen.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import type { Config } from "../lib/config.js";
import type { HookPayload } from "../lib/hook-payload.js";
import {
  runChain,
  type GenerationInput,
  type SessionMessage,
  type TextProvider,
} from "./provider-chain.js";
import { GeminiProvider } from "./gemini-provider.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import { buildLocalSummary, buildNotice, staticForEvent } from "./local-builder.js";
import { AVISOS, type NarrationRequest } from "./static-avisos.js";
import { sanitizeForSpeech } from "./sanitize.js";

const TRANSCRIPT_TAIL_MESSAGES = 10;
const TRANSCRIPT_TAIL_BYTES = 256 * 1024;

/** Punto de entrada del subsistema. Devuelve la petición de narración para el worker. */
export async function buildMessage(
  payload: HookPayload,
  cfg: Config,
): Promise<NarrationRequest> {
  const event = payload.hook_event_name;

  // Modo notice: sin LLM, el mensaje ya viene redactado.
  if (event === "Notification") {
    return buildNotice(payload.message);
  }

  // Acuse fijo: UserPromptSubmit reproduce su aviso pre-sintetizado, sin LLM ni
  // resumen (sin divergencia semántica ni latencia de red en la ruta caliente).
  if (event === "UserPromptSubmit") {
    return { kind: "play", label: AVISOS.UserPromptSubmit.label };
  }

  // Modo summary (Stop, SubagentStop, StopFailure y cualquier otro evento
  // con texto del asistente). SubagentStop/StopFailure caen aquí naturalmente.
  const primary = (payload.last_assistant_message ?? "").trim();

  if (cfg.messageMode === "llm") {
    const providers = buildProviders(cfg);
    if (providers.length > 0) {
      const input: GenerationInput = {
        mode: "summary",
        text: primary,
        messages: readTranscriptMessages(payload.transcript_path),
      };
      const llm = await runChain(providers, input);
      if (llm) {
        const clean = sanitizeForSpeech(llm);
        if (clean) return { kind: "say", text: clean };
      }
    }
  }

  // Degradación local: resumen determinista del texto primario.
  const localSummary = buildLocalSummary(primary);
  if (localSummary) return { kind: "say", text: localSummary };

  // Último recurso: aviso pre-sintetizado por evento.
  return { kind: "play", label: staticForEvent(event).label };
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
 * Devuelve `SessionMessage[]` con rol preservado (user/assistant/system), no
 * texto plano. Best-effort: cualquier fallo devuelve []. Solo lee la cola del
 * archivo para acotar el I/O; descarta líneas malformadas.
 */
function readTranscriptMessages(transcriptPath: string | undefined): SessionMessage[] {
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

    const messages: SessionMessage[] = [];
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

/** Extrae `{role, content}` de una línea JSONL del transcript, o null si no aplica. */
function extractMessage(line: string): SessionMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (!obj || typeof obj !== "object") return null;

    const role = parseRole(obj as Record<string, unknown>);
    if (!role) return null;

    const rawContent = extractContent(obj as Record<string, unknown>);
    const text = extractText(rawContent);
    if (!text) return null;

    return { role, content: text };
  } catch {
    return null;
  }
}

/** Resuelve el rol normalizado (user, assistant, system) desde obj.message, obj.role, obj.source o obj.type. */
function parseRole(obj: Record<string, unknown>): SessionMessage["role"] | null {
  const rawRole =
    (obj.message as { role?: unknown })?.role ??
    obj.role ??
    obj.source ??
    obj.type;

  if (typeof rawRole !== "string") return null;
  const normalized = rawRole.toLowerCase().trim();

  if (
    normalized === "user" ||
    normalized === "user_input" ||
    normalized === "user_explicit"
  ) {
    return "user";
  }

  if (
    normalized === "assistant" ||
    normalized === "model" ||
    normalized === "planner_response"
  ) {
    return "assistant";
  }

  if (normalized === "system") {
    return "system";
  }

  return null;
}

/** Ubica la propiedad de contenido en obj.message.content, obj.content, obj.text, obj.payload, etc. */
function extractContent(obj: Record<string, unknown>): unknown {
  if ((obj.message as { content?: unknown })?.content !== undefined) {
    return (obj.message as { content: unknown }).content;
  }
  if (obj.content !== undefined) return obj.content;
  if ((obj.message as { text?: unknown })?.text !== undefined) {
    return (obj.message as { text: unknown }).text;
  }
  if (obj.text !== undefined) return obj.text;
  if ((obj.payload as { content?: unknown })?.content !== undefined) {
    return (obj.payload as { content: unknown }).content;
  }
  if ((obj.payload as { text?: unknown })?.text !== undefined) {
    return (obj.payload as { text: unknown }).text;
  }
  return undefined;
}

/** Aplana el content (string, array de bloques o string items, u objeto con text/content) a texto plano. */
function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const t = (item as { text?: unknown; content?: unknown }).text ?? (item as { content?: unknown }).content;
          if (typeof t === "string") return t;
        }
        return "";
      })
      .filter((s) => s.length > 0)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (content && typeof content === "object") {
    const t = (content as { text?: unknown; content?: unknown }).text ?? (content as { content?: unknown }).content;
    if (typeof t === "string") return t.trim();
  }

  return "";
}
