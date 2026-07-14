// System prompts por modo de generación. Solo el modo `summary` usa LLM; el
// modo `notice` (Notification) no pasa por aquí (el mensaje ya viene redactado).
// Contrato común impuesto a los modelos y verificado luego por sanitize.ts:
// texto plano, español, 1-2 frases, primera persona, sin markdown ni símbolos.

export type GenerationMode = "summary";

export const SUMMARY_SYSTEM_PROMPT =
  "Eres la voz del asistente de programación Claude Code. " +
  "Recibes el último mensaje del asistente (y, si está, algo del hilo previo). " +
  "Narra en alto nivel, en una o dos frases cortas en español, una síntesis de " +
  "lo realizado en el turno. Parafrasea; no expliques detalle técnico punto por " +
  "punto ni enumeres pasos ni menciones nombres de archivos, rutas o comandos. " +
  "Habla en primera persona. " +
  "Texto plano para leerse en voz alta: sin markdown, sin asteriscos, comillas, " +
  "guiones ni símbolos. Sin puntos al final de las oraciones.";

export function systemPromptFor(mode: GenerationMode): string {
  switch (mode) {
    case "summary":
      return SUMMARY_SYSTEM_PROMPT;
  }
}
