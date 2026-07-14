// Proveedor de fallback: OpenRouter con modelos :free vía fetch nativo, sin SDK.
// Endpoint OpenAI-compatible (chat/completions). Absorbe los 429 y caídas de
// Gemini gracias a sus límites más holgados.
import {
  buildUserContent,
  MAX_OUTPUT_TOKENS,
  REQUEST_TIMEOUT_MS,
  type GenerationInput,
  type TextProvider,
} from "./provider-chain.js";
import { systemPromptFor } from "./prompts.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// Modelo gratuito. Verificar disponibilidad si OpenRouter cambia su catálogo
// :free (bloqueador menor anotado en el diseño).
const MODEL = "meta-llama/llama-3.3-70b-instruct:free";

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenRouterProvider implements TextProvider {
  readonly name = "openrouter";
  constructor(private readonly apiKey: string) {}

  async generate(input: GenerationInput): Promise<string> {
    if (!this.apiKey) throw new Error("OpenRouter: sin API key");

    const body = {
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPromptFor(input.mode) },
        { role: "user", content: buildUserContent(input) },
      ],
    };

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        "x-title": "tts-sidecar-narrator",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);

    const data = (await res.json()) as OpenRouterResponse;
    const text = (data.choices?.[0]?.message?.content ?? "").trim();

    if (!text) throw new Error("OpenRouter devolvió respuesta vacía");
    return text;
  }
}
