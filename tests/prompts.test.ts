// Caracterización de los system prompts adoptados del Orchestrator (§3.1–3.2,
// decisión §5.2): el de resumen NO prohibe rutas/archivos, y el de prompt
// describe la tríada de tres mensajes.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUMMARY_SYSTEM_PROMPT,
  PROMPT_SYSTEM_PROMPT,
  systemPromptFor,
} from "../src/message/prompts.js";

test("SUMMARY_SYSTEM_PROMPT no prohibe rutas, archivos ni comandos", () => {
  assert.ok(!SUMMARY_SYSTEM_PROMPT.includes("rutas"));
  assert.ok(!SUMMARY_SYSTEM_PROMPT.includes("archivos"));
  assert.ok(!SUMMARY_SYSTEM_PROMPT.includes("comandos"));
  assert.ok(SUMMARY_SYSTEM_PROMPT.includes("primera persona"));
});

test("PROMPT_SYSTEM_PROMPT describe la tríada de tres mensajes", () => {
  assert.ok(PROMPT_SYSTEM_PROMPT.includes("tres mensajes"));
  assert.ok(PROMPT_SYSTEM_PROMPT.toLowerCase().includes("petición"));
});

test("systemPromptFor mapea modo → prompt", () => {
  assert.equal(systemPromptFor("summary"), SUMMARY_SYSTEM_PROMPT);
  assert.equal(systemPromptFor("prompt"), PROMPT_SYSTEM_PROMPT);
});
