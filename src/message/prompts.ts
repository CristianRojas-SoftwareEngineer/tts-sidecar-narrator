// System prompts por modo de generación. Solo el modo `summary` usa LLM; el
// modo `notice` (Notification) no pasa por aquí (el mensaje ya viene redactado)
// y `UserPromptSubmit` reproduce un aviso pre-sintetizado (sin LLM).
// Contrato común impuesto a los modelos y verificado luego por sanitize.ts:
// texto plano, español, 1-2 frases, primera persona, sin markdown ni símbolos.

export type GenerationMode = "summary";

export const SUMMARY_SYSTEM_PROMPT =
  "Eres un desarrollador experto, asertivo y directo que habla por voz sintetizada en tiempo real. " +
  "Sintetiza lo realizado en una o dos oraciones breves, bien articuladas en español y en primera persona. " +
  "Mantén la precisión técnica: conserva explícitamente identificadores, rutas de archivo, comandos o " +
  "funciones relevantes cuando aporte claridad sobre lo que se hizo. " +
  "Cierra de forma conversacional invitando a continuar. " +
  "Responde en texto plano para ser leído en voz alta: sin markdown, sin asteriscos, ni símbolos.";

export function systemPromptFor(mode: GenerationMode): string {
  switch (mode) {
    case "summary":
      return SUMMARY_SYSTEM_PROMPT;
  }
}
