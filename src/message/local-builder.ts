// Constructor local (sin red): último nivel de la cadena y modo de primera clase
// (messageMode: "local"). Dos capas: (1) resumen determinista del texto primario;
// (2) si no hay material utilizable, el aviso estático pre-sintetizado por evento
// (catálogo de static-avisos.ts). Garantiza que la narración nunca se quede sin
// algo que decir.
import { sanitizeForSpeech } from "./sanitize.js";
import { AVISOS, type Aviso, type NarrationRequest } from "./static-avisos.js";

const AVISO_BY_EVENT: Record<string, Aviso> = {
  Stop: AVISOS.Stop,
  UserPromptSubmit: AVISOS.UserPromptSubmit,
  SubagentStop: AVISOS.SubagentStop,
  StopFailure: AVISOS.StopFailure,
  Notification: AVISOS.Notification,
};

/** Resumen determinista del texto primario. Puede devolver "" si no hay prosa. */
export function buildLocalSummary(text: string): string {
  return sanitizeForSpeech(text);
}

/** Aviso estático de último recurso (texto + label horneado), según el evento. */
export function staticForEvent(eventName: string | undefined): Aviso {
  return AVISO_BY_EVENT[eventName ?? ""] ?? AVISOS.Default;
}

/**
 * Modo notice (Notification): el mensaje ya viene corto y redactado; solo se
 * limpia para voz y se sintetiza (`say`). Si queda vacío, cae al aviso
 * pre-sintetizado del evento (`play`).
 */
export function buildNotice(message: string | undefined): NarrationRequest {
  const clean = sanitizeForSpeech(message ?? "");
  if (clean) return { kind: "say", text: clean };
  return { kind: "play", label: staticForEvent("Notification").label };
}
