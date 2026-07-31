// Caracterización del system prompt de resumen adoptado del Orchestrator
// (§3.1–3.2, decisión §5.2): NO prohibe rutas/archivos. El modo prompt se
// eliminó con el acuse fijo pre-sintetizado de UserPromptSubmit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SUMMARY_SYSTEM_PROMPT, systemPromptFor } from "../src/message/prompts.js";

test("SUMMARY_SYSTEM_PROMPT exige precisión técnica y primera persona", () => {
  assert.ok(SUMMARY_SYSTEM_PROMPT.includes("precisión técnica"));
  assert.ok(SUMMARY_SYSTEM_PROMPT.includes("primera persona"));
});

test("systemPromptFor mapea modo → prompt", () => {
  assert.equal(systemPromptFor("summary"), SUMMARY_SYSTEM_PROMPT);
});
