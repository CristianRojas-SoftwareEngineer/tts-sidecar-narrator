// Aviso estático por evento: destino declarado de último recurso (`play` de un
// WAV horneado del catálogo de static-avisos.ts). Garantiza que la narración
// nunca se quede sin algo que decir cuando el umbral degrada sin LLM.
import { AVISOS, type Aviso } from "./static-avisos.js";

const AVISO_BY_EVENT: Record<string, Aviso> = {
  Stop: AVISOS.Stop,
  UserPromptSubmit: AVISOS.UserPromptSubmit,
  SubagentStop: AVISOS.SubagentStop,
  StopFailure: AVISOS.StopFailure,
  Notification: AVISOS.Notification,
};

/** Aviso estático de último recurso (texto + label horneado), según el evento. */
export function staticForEvent(eventName: string | undefined): Aviso {
  return AVISO_BY_EVENT[eventName ?? ""] ?? AVISOS.Default;
}
