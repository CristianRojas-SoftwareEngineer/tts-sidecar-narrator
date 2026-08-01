// Orquestador del subsistema de mensajes: payload → petición de narración
// (`say` con texto dinámico o `play` de un aviso pre-sintetizado). Siempre
// resuelve (nunca lanza). Flujo MVP determinista: solo `Stop` (y el default
// para evento desconocido/ausente) genera locución dinámica, y el LLM recibe
// ÚNICAMENTE `last_assistant_message` — ni transcript ni historial. El resto de
// eventos (`Notification`, `SubagentStop`, `StopFailure`, `UserPromptSubmit`)
// reproduce su aviso horneado (`play`), sin LLM ni síntesis por evento.
// Degradación de la ruta `Stop`: cadena LLM (input acotado con clampHead) →
// resumen local determinista (clampSentences) → aviso estático por evento.
import type { Config } from "../lib/config.js";
import type { HookPayload } from "../lib/hook-payload.js";
import { runChain, type GenerationInput, type TextProvider } from "./provider-chain.js";
import { GeminiProvider } from "./gemini-provider.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import { staticForEvent } from "./local-builder.js";
import { AVISOS, type NarrationRequest } from "./static-avisos.js";
import { sanitizeForSpeech } from "./sanitize.js";
import { clampHead, clampSentences, LOCAL_SPEECH_MAX_CHARS } from "./clamp.js";

/** Punto de entrada del subsistema. Devuelve la petición de narración para el worker. */
export async function buildMessage(
  payload: HookPayload,
  cfg: Config,
): Promise<NarrationRequest> {
  const event = payload.hook_event_name;

  // Eventos con aviso fijo pre-sintetizado: sin LLM ni síntesis por evento.
  if (event === "Notification") {
    return { kind: "play", label: AVISOS.Notification.label };
  }
  if (event === "UserPromptSubmit") {
    return { kind: "play", label: AVISOS.UserPromptSubmit.label };
  }
  if (event === "SubagentStop") {
    return { kind: "play", label: AVISOS.SubagentStop.label };
  }
  if (event === "StopFailure") {
    return { kind: "play", label: AVISOS.StopFailure.label };
  }

  // Ruta Stop (y default para evento desconocido/ausente): única ruta dinámica.
  const raw = payload.last_assistant_message ?? "";
  const primary = sanitizeForSpeech(raw);

  // Umbral: sin material narrable no se invoca el LLM.
  if (primary === "") {
    return { kind: "play", label: staticForEvent(event).label };
  }

  if (cfg.messageMode === "llm") {
    const providers = buildProviders(cfg);
    if (providers.length > 0) {
      const input: GenerationInput = { text: clampHead(raw) };
      const llm = await runChain(providers, input);
      if (llm) {
        const clean = sanitizeForSpeech(llm);
        if (clean) return { kind: "say", text: clean };
      }
    }
  }

  // Degradación local determinista: resumen acotado del texto primario.
  return { kind: "say", text: clampSentences(primary, LOCAL_SPEECH_MAX_CHARS) };
}

/** Providers en orden de prioridad; se omite el que no tenga key. */
function buildProviders(cfg: Config): TextProvider[] {
  const providers: TextProvider[] = [];
  if (cfg.geminiApiKey) providers.push(new GeminiProvider(cfg.geminiApiKey));
  if (cfg.openRouterApiKey) providers.push(new OpenRouterProvider(cfg.openRouterApiKey));
  return providers;
}
