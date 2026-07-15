// Tests de contrato de los adaptadores Gemini/OpenRouter con fetch mockeado:
// parseo de la respuesta, HTTP no-ok y respuesta vacía. Nunca tocan la red.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider } from "../src/message/gemini-provider.js";
import { OpenRouterProvider } from "../src/message/openrouter-provider.js";
import type { GenerationInput } from "../src/message/provider-chain.js";

const INPUT: GenerationInput = {
  mode: "summary",
  text: "Terminé la tarea.",
  transcript: [],
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

test("Gemini: extrae y une el texto de las parts de la respuesta", async () => {
  mockFetch(200, {
    candidates: [
      { content: { parts: [{ text: "Hola " }, { text: "mundo" }] } },
    ],
  });
  const text = await new GeminiProvider("clave").generate(INPUT);
  assert.equal(text, "Hola mundo");
  assert.ok(lastRequest?.url.includes("generativelanguage.googleapis.com"));
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

// --- OpenRouter ---

test("OpenRouter: extrae el content del primer choice", async () => {
  mockFetch(200, {
    choices: [{ message: { content: "  Texto narrado  " } }],
  });
  const text = await new OpenRouterProvider("clave").generate(INPUT);
  assert.equal(text, "Texto narrado");
  assert.ok(lastRequest?.url.includes("openrouter.ai"));
});

test("OpenRouter: manda la clave como Bearer, nunca en la URL", async () => {
  mockFetch(200, { choices: [{ message: { content: "ok" } }] });
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

test("OpenRouter: lanza ante una respuesta sin choices o sin content", async () => {
  mockFetch(200, { choices: [] });
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
