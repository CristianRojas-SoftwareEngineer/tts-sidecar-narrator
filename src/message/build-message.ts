// Orquestador del subsistema de mensajes: payload → texto a narrar. Siempre
// resuelve (nunca lanza). Degradación: cadena LLM (solo modo summary y con keys)
// → resumen local determinista → texto estático por evento. El modo notice
// (Notification) no usa LLM. El modo prompt (UserPromptSubmit) usa LLM para
// responder brevemente al prompt actual.
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

  // Modo prompt: UserPromptSubmit necesita contexto del transcript + prompt actual.
  // El payload no tiene last_assistant_message (aún no ha respondido).
  if (event === "UserPromptSubmit") {
    return buildPromptMessage(payload, cfg);
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

/**
 * Mensaje para UserPromptSubmit: responde al prompt actual como asistente de voz.
 * Construye la tríada curada del Orchestrator (§5.3): petición previa del usuario,
 * última respuesta del asistente y petición actual (esta última, fiable, del
 * payload). Usa LLM si está disponible; de lo contrario fallback local o estático.
 */
async function buildPromptMessage(payload: HookPayload, cfg: Config): Promise<string> {
  // Tríada: prompt actual del payload (fiable) enriquecido con el hilo previo.
  const transcript = readTranscriptMessages(payload.transcript_path);
  const prevUser = lastOfRole(transcript, "user");
  const lastAssistant = lastOfRole(transcript, "assistant");
  const currentPrompt =
    (payload.prompt ?? "").trim() ||
    (transcript.length ? transcript[transcript.length - 1].content : "");

  const messages: SessionMessage[] = [];
  if (prevUser) messages.push({ role: "user", content: prevUser });
  if (lastAssistant) messages.push({ role: "assistant", content: lastAssistant });
  messages.push({ role: "user", content: currentPrompt });

  // En modo LLM, generar respuesta breve a la tríada.
  if (cfg.messageMode === "llm") {
    const providers = buildProviders(cfg);
    if (providers.length > 0) {
      const input: GenerationInput = {
        mode: "prompt",
        text: currentPrompt,
        messages,
      };
      const llm = await runChain(providers, input);
      if (llm) {
        const clean = sanitizeForSpeech(llm);
        if (clean) return clean;
      }
    }
  }

  // Degradación local: usar el prompt como texto primario.
  const localSummary = buildLocalSummary(currentPrompt);
  if (localSummary) return localSummary;

  // Último recurso: estático.
  return staticForEvent("UserPromptSubmit");
}

/** Último mensaje del rol indicado en la lista, o undefined si no hay. */
function lastOfRole(messages: SessionMessage[], role: SessionMessage["role"]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role) return messages[i].content;
  }
  return undefined;
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
    const obj = JSON.parse(trimmed) as {
      type?: string;
      role?: string;
      message?: { role?: string; content?: unknown };
    };
    const role = obj.message?.role ?? obj.role ?? obj.type;
    if (role !== "user" && role !== "assistant" && role !== "system") return null;

    const text = extractText(obj.message?.content);
    if (!text) return null;

    return { role: role as SessionMessage["role"], content: text };
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
