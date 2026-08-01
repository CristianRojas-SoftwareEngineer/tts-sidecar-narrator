// Topes deterministas: clampHead conserva la cabeza cortando en párrafo;
// clampSentences acumula oraciones completas y corta la oración-gigante en
// límite de palabra. Ambas puras: mismo input → mismo output; vacío → "".
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampHead,
  clampSentences,
  LLM_INPUT_MAX_CHARS,
} from "../src/message/clamp.js";

// --- clampHead ---

test("clampHead devuelve el texto tal cual si ya cabe", () => {
  const t = "Un mensaje corto que cabe sin problema.";
  assert.equal(clampHead(t), t);
});

test("clampHead corta en el último límite de párrafo por debajo del tope", () => {
  const p1 = "A".repeat(10000);
  const p2 = "B".repeat(10000);
  const out = clampHead(`${p1}\n\n${p2}`);
  assert.equal(out, p1);
  assert.ok(out.length <= LLM_INPUT_MAX_CHARS);
});

test("clampHead sin párrafo retrocede a límite de palabra", () => {
  const word = "palabra ";
  const text = word.repeat(3000); // ~24000 chars, sin '\n\n'
  const out = clampHead(text);
  assert.ok(out.length <= LLM_INPUT_MAX_CHARS);
  assert.ok(!out.endsWith("palab")); // nunca a mitad de palabra
  assert.ok(out.endsWith("palabra"));
});

test("clampHead con palabra única más larga que el tope hace corte duro", () => {
  const giant = "x".repeat(LLM_INPUT_MAX_CHARS + 500);
  const out = clampHead(giant);
  assert.equal(out.length, LLM_INPUT_MAX_CHARS);
});

test("clampHead con texto vacío devuelve ''", () => {
  assert.equal(clampHead(""), "");
});

// --- clampSentences ---

test("clampSentences acumula oraciones completas hasta el tope", () => {
  const text = "Una. Dos. Tres. Cuatro.";
  // Tope que admite "Una. Dos." pero no "Tres.".
  const out = clampSentences(text, 10);
  assert.equal(out, "Una. Dos.");
});

test("clampSentences devuelve el texto entero si ya cabe", () => {
  const text = "Corto y completo.";
  assert.equal(clampSentences(text, 400), text);
});

test("clampSentences reconoce los terminadores . ! ? …", () => {
  const text = "Hecho! ¿Sigo? Claro… Fin.";
  const out = clampSentences(text, 14);
  assert.equal(out, "Hecho! ¿Sigo?");
});

test("clampSentences corta la oración-gigante en límite de palabra, sin puntos suspensivos", () => {
  const text = "Esta primera oración es mucho más larga que el tope permitido aquí.";
  const out = clampSentences(text, 20);
  assert.ok(out.length <= 20);
  assert.ok(!out.endsWith("…"));
  assert.ok(!out.endsWith(" "));
  // No corta a mitad de palabra: la última palabra está completa.
  assert.ok(text.startsWith(out));
  assert.ok(out.split(" ").every((w) => text.includes(w)));
});

test("clampSentences con tope exacto incluye la oración que encaja justo", () => {
  const text = "Uno dos tres. Cuatro.";
  assert.equal(clampSentences(text, "Uno dos tres.".length), "Uno dos tres.");
});

test("clampSentences con texto vacío o solo espacios devuelve ''", () => {
  assert.equal(clampSentences("", 400), "");
  assert.equal(clampSentences("   ", 400), "");
});
