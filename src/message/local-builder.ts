// Constructor local (sin red): último nivel de la cadena y modo de primera clase
// (messageMode: "local"). Dos capas: (1) resumen determinista del texto primario;
// (2) si no hay material utilizable, un texto estático por evento. Garantiza que
// la narración nunca se quede sin algo que decir.
import { sanitizeForSpeech } from "./sanitize.js";

const STATIC_BY_EVENT: Record<string, string> = {
  Stop: "El asistente terminó su turno",
  Notification: "Claude necesita tu atención",
  SessionStart: "Sesión iniciada",
};

const STATIC_DEFAULT = "El asistente completó una acción";

/** Resumen determinista del texto primario. Puede devolver "" si no hay prosa. */
export function buildLocalSummary(text: string): string {
  return sanitizeForSpeech(text);
}

/** Texto estático de último recurso, según el evento. */
export function staticForEvent(eventName: string | undefined): string {
  return STATIC_BY_EVENT[eventName ?? ""] ?? STATIC_DEFAULT;
}

/**
 * Modo notice (Notification): el mensaje ya viene corto y redactado; solo se
 * limpia para voz. Si queda vacío, cae al estático del evento.
 */
export function buildNotice(message: string | undefined): string {
  const clean = sanitizeForSpeech(message ?? "");
  return clean || staticForEvent("Notification");
}
