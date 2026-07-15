// La barrera de saneamiento antes de narrar o de enviar texto a un LLM externo:
// verifica que efectivamente quita lo que dice quitar.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toPlainText,
  firstSentences,
  sanitizeForSpeech,
} from "../src/message/sanitize.js";

test("toPlainText elimina bloques de código cercados y su contenido", () => {
  const input = "Antes.\n```js\nconst clave = \"secreto\";\n```\nDespués.";
  const out = toPlainText(input);
  assert.equal(out, "Antes. Después.");
  assert.ok(!out.includes("secreto"));
});

test("toPlainText elimina bloques cercados con virgulillas", () => {
  assert.equal(toPlainText("Uno ~~~\ncódigo\n~~~ dos"), "Uno dos");
});

test("toPlainText elimina código en línea con su contenido", () => {
  const out = toPlainText("Ejecuta `rm -rf /tmp/x` ahora.");
  assert.ok(!out.includes("rm"));
  assert.equal(out, "Ejecuta ahora.");
});

test("toPlainText conserva el texto de enlaces y descarta la URL", () => {
  assert.equal(
    toPlainText("Mira [la guía](https://example.com/guia) completa."),
    "Mira la guía completa.",
  );
});

test("toPlainText convierte imágenes a su texto alternativo", () => {
  assert.equal(toPlainText("![diagrama](img.png) listo"), "diagrama listo");
});

test("toPlainText elimina URLs sueltas", () => {
  const out = toPlainText("Visita https://example.com/ruta?x=1 para más.");
  assert.ok(!out.includes("example"));
  assert.equal(out, "Visita para más.");
});

test("toPlainText quita encabezados, citas y viñetas al inicio de línea", () => {
  const input = "## Título\n> cita\n- punto uno\n* punto dos\n1. numerado\n2) también";
  assert.equal(
    toPlainText(input),
    "Título cita punto uno punto dos numerado también",
  );
});

test("toPlainText quita énfasis y tachado", () => {
  assert.equal(toPlainText("**negrita** _cursiva_ ~~tachado~~"), "negrita cursiva tachado");
});

test("toPlainText conserva acentos, eñes y puntuación del español", () => {
  const input = "¿Quién? ¡Añadió más configuración, según él!";
  assert.equal(toPlainText(input), input);
});

test("toPlainText reemplaza símbolos no narrables y colapsa espacios", () => {
  const out = toPlainText("a @ b   #   c\n\n\nd");
  assert.equal(out, "a b c d");
});

test("toPlainText tolera entrada vacía y valores nulos", () => {
  assert.equal(toPlainText(""), "");
  // La firma exige string, pero el código defiende contra null en runtime.
  assert.equal(toPlainText(null as unknown as string), "");
});

test("firstSentences devuelve las primeras oraciones pedidas", () => {
  const text = "Primera. Segunda! Tercera? Cuarta.";
  assert.equal(firstSentences(text, 2), "Primera. Segunda!");
  assert.equal(firstSentences(text, 3), "Primera. Segunda! Tercera?");
});

test("firstSentences devuelve el texto tal cual si no hay oraciones", () => {
  assert.equal(firstSentences(""), "");
});

test("firstSentences incluye una oración final sin puntuación de cierre", () => {
  assert.equal(firstSentences("Una. Dos sin punto", 2), "Una. Dos sin punto");
});

test("sanitizeForSpeech devuelve cadena vacía si no queda nada utilizable", () => {
  assert.equal(sanitizeForSpeech(""), "");
  assert.equal(sanitizeForSpeech("```\nsolo código\n```"), "");
  assert.equal(sanitizeForSpeech("@#$%^&*"), "");
});

test("sanitizeForSpeech limita a las oraciones pedidas", () => {
  const out = sanitizeForSpeech("Uno. Dos. Tres. Cuatro.", 2);
  assert.equal(out, "Uno. Dos.");
});

test("sanitizeForSpeech recorta a 320 caracteres sin partir palabras", () => {
  const palabra = "palabra";
  const larga = (palabra + " ").repeat(100).trim() + ".";
  const out = sanitizeForSpeech(larga, 1);
  assert.ok(out.length <= 320);
  // El recorte cae en un límite de palabra: no deja un fragmento de "palabra".
  const last = out.split(" ").at(-1);
  assert.equal(last, palabra);
});

test("sanitizeForSpeech integra el pipeline completo", () => {
  const input =
    "# Resultado\nSe corrigió el **bug** en `config.ts`. Ver [detalles](https://x.dev). Tercera oración.";
  assert.equal(
    sanitizeForSpeech(input),
    "Resultado Se corrigió el bug en . Ver detalles.",
  );
});
