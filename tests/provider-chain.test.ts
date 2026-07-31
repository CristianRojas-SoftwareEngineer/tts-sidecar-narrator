// El corazón del «costo cero con degradación local»: el orden de fallback y
// que ningún fallo de un proveedor se propague al llamante. Además, el mapeo
// de roles de buildUserContent (§3.3 del plan).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runChain,
  buildUserContent,
  type GenerationInput,
  type SessionMessage,
  type TextProvider,
} from "../src/message/provider-chain.js";

const MESSAGES: SessionMessage[] = [
  { role: "user", content: "Hola" },
  { role: "assistant", content: "Hola, ¿en qué ayudo?" },
];

const INPUT: GenerationInput = {
  mode: "summary",
  text: "Último mensaje.",
  messages: MESSAGES,
};

function provider(
  name: string,
  behavior: () => Promise<string>,
  calls: string[],
): TextProvider {
  return {
    name,
    generate: () => {
      calls.push(name);
      return behavior();
    },
  };
}

test("runChain devuelve el primer texto no vacío sin llamar al resto", async () => {
  const calls: string[] = [];
  const result = await runChain(
    [
      provider("gemini", async () => "Texto de Gemini", calls),
      provider("openrouter", async () => "No debería llamarse", calls),
    ],
    INPUT,
  );
  assert.equal(result, "Texto de Gemini");
  assert.deepEqual(calls, ["gemini"]);
});

test("runChain cae al siguiente nivel ante una excepción (HTTP, timeout)", async () => {
  const calls: string[] = [];
  const result = await runChain(
    [
      provider("gemini", async () => { throw new Error("Gemini HTTP 429"); }, calls),
      provider("openrouter", async () => "Texto de OpenRouter", calls),
    ],
    INPUT,
  );
  assert.equal(result, "Texto de OpenRouter");
  assert.deepEqual(calls, ["gemini", "openrouter"]);
});

test("runChain trata la respuesta vacía o solo espacios como fallo", async () => {
  const calls: string[] = [];
  const result = await runChain(
    [
      provider("gemini", async () => "   ", calls),
      provider("openrouter", async () => "Respaldo", calls),
    ],
    INPUT,
  );
  assert.equal(result, "Respaldo");
});

test("runChain devuelve undefined si todos los proveedores fallan", async () => {
  const calls: string[] = [];
  const result = await runChain(
    [
      provider("gemini", async () => { throw new Error("timeout"); }, calls),
      provider("openrouter", async () => { throw new Error("HTTP 500"); }, calls),
    ],
    INPUT,
  );
  assert.equal(result, undefined);
  assert.deepEqual(calls, ["gemini", "openrouter"]);
});

test("runChain con lista vacía devuelve undefined", async () => {
  assert.equal(await runChain([], INPUT), undefined);
});

test("runChain recorta espacios del texto devuelto", async () => {
  const result = await runChain(
    [provider("gemini", async () => "  con espacios \n", [])],
    INPUT,
  );
  assert.equal(result, "con espacios");
});

// --- buildUserContent (mapeo de roles §3.3) ---

test("buildUserContent conserva user/assistant y aplana system a user con prefijo en modo summary", () => {
  const out = buildUserContent({
    mode: "summary",
    text: "",
    messages: [
      { role: "system", content: "regla" },
      { role: "user", content: "hola" },
      { role: "assistant", content: "hola" },
    ],
  });
  assert.deepEqual(out, [
    { role: "user", content: "[Sistema]: regla" },
    { role: "user", content: "hola" },
    { role: "assistant", content: "hola" },
    {
      role: "user",
      content: "Cuéntame en voz alta en primera persona y de forma técnica qué lograste avanzar.",
    },
  ]);
});

test("buildUserContent anexa input.text como assistant en modo summary si no está al final", () => {
  const out = buildUserContent({
    mode: "summary",
    text: "respuesta actual",
    messages: [{ role: "user", content: "hola" }],
  });
  assert.deepEqual(out, [
    { role: "user", content: "hola" },
    { role: "assistant", content: "respuesta actual" },
    {
      role: "user",
      content: "Cuéntame en voz alta en primera persona y de forma técnica qué lograste avanzar.",
    },
  ]);
});

test("buildUserContent filtra mensajes vacíos", () => {
  const out = buildUserContent({
    mode: "summary",
    text: "",
    messages: [
      { role: "user", content: "  " },
      { role: "user", content: "útil" },
      { role: "assistant", content: "" },
    ],
  });
  assert.deepEqual(out, [{ role: "user", content: "útil" }]);
});

test("buildUserContent con lista vacía y sin texto devuelve []", () => {
  assert.deepEqual(
    buildUserContent({ mode: "summary", text: "", messages: [] }),
    [],
  );
});
