// Tests de contrato de los adaptadores Gemini/OpenRouter con fetch mockeado:
// parseo de la respuesta, HTTP no-ok y respuesta vacía. Nunca tocan la red.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider } from "../src/message/gemini-provider.js";
import { OpenRouterProvider } from "../src/message/openrouter-provider.js";
import type { GenerationInput, SessionMessage } from "../src/message/provider-chain.js";

const MESSAGES: SessionMessage[] = [
  { role: "user", content: "Hola" },
  { role: "assistant", content: "Hola, ¿en qué ayudo?" },
];

const INPUT: GenerationInput = {
  mode: "summary",
  text: "Terminé la tarea.",
  messages: MESSAGES,
};

const realFetch = globalThis.fetch;
let lastRequest: { url: string; init: RequestInit } | undefined;

function mockFetch(status: number, payload: unknown): void {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    lastRequest = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify(payload), { status });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  lastRequest = undefined;
});

// --- Gemini ---

test("Gemini: usa el modelo gemini-3.1-flash-lite y el endpoint generateContent", async () => {
  mockFetch(200, {
    candidates: [{ content: { parts: [{ text: "ok" }] } }],
  });
  await new GeminiProvider("clave").generate(INPUT);
  assert.ok(lastRequest?.url.includes("gemini-3.1-flash-lite"));
  assert.ok(lastRequest?.url.includes(":generateContent"));
});

test("Gemini: manda la clave por header, nunca en la URL", async () => {
  mockFetch(200, {
    candidates: [{ content: { parts: [{ text: "ok" }] } }],
  });
  await new GeminiProvider("clave-secreta").generate(INPUT);
  const headers = lastRequest?.init.headers as Record<string, string>;
  assert.equal(headers["x-goog-api-key"], "clave-secreta");
  assert.ok(!lastRequest?.url.includes("clave-secreta"));
});

test("Gemini: serializa messages con rol model para assistant", async () => {
  mockFetch(200, {
    candidates: [{ content: { parts: [{ text: "ok" }] } }],
  });
  await new GeminiProvider("clave").generate(INPUT);
  const body = JSON.parse(lastRequest!.init.body as string);
  assert.deepEqual(body.contents, [
    { role: "user", parts: [{ text: "Hola" }] },
    { role: "model", parts: [{ text: "Hola, ¿en qué ayudo?" }] },
    { role: "model", parts: [{ text: "Terminé la tarea." }] },
    {
      role: "user",
      parts: [
        {
          text: "Cuéntame en voz alta en primera persona y de forma técnica qué lograste avanzar.",
        },
      ],
    },
  ]);
  assert.ok(body.systemInstruction.parts[0].text.includes("primera persona"));
});

test("Gemini: extrae y une el texto de las parts de la respuesta", async () => {
  mockFetch(200, {
    candidates: [
      { content: { parts: [{ text: "Hola " }, { text: "mundo" }] } },
    ],
  });
  const text = await new GeminiProvider("clave").generate(INPUT);
  assert.equal(text, "Hola mundo");
});

test("Gemini: lanza ante HTTP no-ok con el status en el mensaje", async () => {
  mockFetch(429, {});
  await assert.rejects(
    () => new GeminiProvider("clave").generate(INPUT),
    /Gemini HTTP 429/,
  );
});

test("Gemini: lanza ante una respuesta sin texto", async () => {
  mockFetch(200, { candidates: [] });
  await assert.rejects(
    () => new GeminiProvider("clave").generate(INPUT),
    /vacía/,
  );
});

test("Gemini: lanza sin llamar a fetch si no hay API key", async () => {
  mockFetch(200, {});
  await assert.rejects(() => new GeminiProvider("").generate(INPUT), /sin API key/);
  assert.equal(lastRequest, undefined);
});

// --- OpenRouter (formato Anthropic Messages) ---

test("OpenRouter: usa el modelo poolside y el endpoint /api/v1/messages", async () => {
  mockFetch(200, { content: [{ type: "text", text: "ok" }] });
  await new OpenRouterProvider("clave").generate(INPUT);
  assert.ok(lastRequest?.url.includes("openrouter.ai"));
  assert.ok(lastRequest?.url.includes("/api/v1/messages"));
  const body = JSON.parse(lastRequest!.init.body as string);
  assert.equal(body.model, "poolside/laguna-xs-2.1:free");
});

test("OpenRouter: manda system + messages (formato Anthropic), no chat/completions", async () => {
  mockFetch(200, { content: [{ type: "text", text: "ok" }] });
  await new OpenRouterProvider("clave").generate(INPUT);
  const body = JSON.parse(lastRequest!.init.body as string);
  assert.ok("system" in body);
  assert.ok(Array.isArray(body.messages));
  assert.equal(body.messages[0].role, "user");
  assert.equal(body.messages[0].content, "Hola");
  assert.equal(body.messages[1].role, "assistant");
  assert.ok(!("choices" in body));
});

test("OpenRouter: extrae el content tipo texto de la respuesta", async () => {
  mockFetch(200, {
    content: [
      { type: "text", text: "  Texto narrado  " },
      { type: "other", text: "ignorado" },
    ],
  });
  const text = await new OpenRouterProvider("clave").generate(INPUT);
  assert.equal(text, "Texto narrado");
});

test("OpenRouter: manda la clave como Bearer, nunca en la URL", async () => {
  mockFetch(200, { content: [{ type: "text", text: "ok" }] });
  await new OpenRouterProvider("clave-secreta").generate(INPUT);
  const headers = lastRequest?.init.headers as Record<string, string>;
  assert.equal(headers["authorization"], "Bearer clave-secreta");
  assert.ok(!lastRequest?.url.includes("clave-secreta"));
});

test("OpenRouter: lanza ante HTTP no-ok con el status en el mensaje", async () => {
  mockFetch(500, {});
  await assert.rejects(
    () => new OpenRouterProvider("clave").generate(INPUT),
    /OpenRouter HTTP 500/,
  );
});

test("OpenRouter: lanza ante una respuesta sin content", async () => {
  mockFetch(200, { content: [] });
  await assert.rejects(
    () => new OpenRouterProvider("clave").generate(INPUT),
    /vacía/,
  );
});

test("OpenRouter: lanza sin llamar a fetch si no hay API key", async () => {
  mockFetch(200, {});
  await assert.rejects(
    () => new OpenRouterProvider("").generate(INPUT),
    /sin API key/,
  );
  assert.equal(lastRequest, undefined);
});
