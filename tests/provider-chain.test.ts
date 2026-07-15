// El corazón del «costo cero con degradación local»: el orden de fallback y
// que ningún fallo de un proveedor se propague al llamante.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runChain,
  buildUserContent,
  type GenerationInput,
  type TextProvider,
} from "../src/message/provider-chain.js";

const INPUT: GenerationInput = {
  mode: "summary",
  text: "Último mensaje.",
  transcript: [],
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
    [provider("gemini", async () => "  con espacios  \n", [])],
    INPUT,
  );
  assert.equal(result, "con espacios");
});

test("buildUserContent sin transcript solo incluye el texto primario", () => {
  const out = buildUserContent(INPUT);
  assert.equal(out, "Último mensaje del asistente en este turno:\nÚltimo mensaje.");
});

test("buildUserContent antepone el contexto del transcript cuando existe", () => {
  const out = buildUserContent({
    ...INPUT,
    transcript: ["usuario: hola", "asistente: hola"],
  });
  assert.equal(
    out,
    [
      "Contexto reciente de la conversación:",
      "usuario: hola\nasistente: hola",
      "",
      "Último mensaje del asistente en este turno:",
      "Último mensaje.",
    ].join("\n"),
  );
});
