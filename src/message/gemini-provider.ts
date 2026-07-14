// Proveedor principal: Gemini API (free tier) vía fetch nativo, sin SDK.
// thinking desactivado (thinkingBudget: 0) y salida acotada para optimizar
// latencia y cuota.
import {
  buildUserContent,
  MAX_OUTPUT_TOKENS,
  REQUEST_TIMEOUT_MS,
  type GenerationInput,
  type TextProvider,
} from "./provider-chain.js";
import { systemPromptFor } from "./prompts.js";

// Modelo Flash del nivel gratuito. Verificar que sigue vigente si Gemini cambia
// su catálogo (bloqueador menor anotado en el diseño).
const MODEL = "gemini-2.0-flash";
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export class GeminiProvider implements TextProvider {
  readonly name = "gemini";
  constructor(private readonly apiKey: string) {}

  async generate(input: GenerationInput): Promise<string> {
    if (!this.apiKey) throw new Error("Gemini: sin API key");

    const body = {
      systemInstruction: {
        parts: [{ text: systemPromptFor(input.mode) }],
      },
      contents: [
        { role: "user", parts: [{ text: buildUserContent(input) }] },
      ],
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    const res = await fetch(ENDPOINT(MODEL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);

    const data = (await res.json()) as GeminiResponse;
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) throw new Error("Gemini devolvió respuesta vacía");
    return text;
  }
}
