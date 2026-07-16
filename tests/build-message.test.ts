// Caracterización de buildMessage: enrutado de eventos, tríada de
// UserPromptSubmit (§5.3) y mapeo de roles (§3.3) contra Gemini.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMessage } from "../src/message/build-message.js";
import { withEnv } from "./helpers.js";
import type { Config } from "../src/lib/config.js";
import type { HookPayload } from "../src/lib/hook-payload.js";

const LOCAL: Config = {
  enabled: true,
  messageMode: "local",
  geminiApiKey: undefined,
  openRouterApiKey: undefined,
};

// --- Enrutado de eventos (modo local: sin LLM) ---

test("UserPromptSubmit (local) usa el prompt del payload", async () => {
  const out = await buildMessage(
    { hook_event_name: "UserPromptSubmit", prompt: "haz X" },
    LOCAL,
  );
  assert.equal(out, "haz X");
});

test("SubagentStop (local) narra el fallback del Orchestrator", async () => {
  const out = await buildMessage({ hook_event_name: "SubagentStop" }, LOCAL);
  assert.equal(out, "El subagente completó su trabajo.");
});

test("StopFailure (local) narra el fallback del Orchestrator", async () => {
  const out = await buildMessage({ hook_event_name: "StopFailure" }, LOCAL);
  assert.equal(out, "Ocurrió un error durante la ejecución.");
});

test("Stop (local) sin last_assistant cae al fallback", async () => {
  const out = await buildMessage({ hook_event_name: "Stop" }, LOCAL);
  assert.equal(out, "El asistente terminó su turno.");
});

test("Notification (local) usa su texto propio", async () => {
  const out = await buildMessage(
    { hook_event_name: "Notification", message: "**Atención**" },
    LOCAL,
  );
  assert.equal(out, "Atención");
});

// --- Tríada + mapeo de roles vía Gemini (fetch mockeado) ---

const realFetch = globalThis.fetch;
let lastBody: unknown;

function mockGemini(text: string): void {
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    lastBody = init ? JSON.parse(init.body as string) : undefined;
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      { status: 200 },
    );
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  lastBody = undefined;
});

test("UserPromptSubmit (llm) arma la tríada en orden y mapea roles a Gemini", async () => {
  const restoreEnv = withEnv({ GEMINI_API_KEY: "dummy" });
  try {
    const transcriptPath = join(tmpdir(), `narrator-tríada-${Date.now()}.jsonl`);
    writeFileSync(
      transcriptPath,
      [
        JSON.stringify({ message: { role: "user", content: "petición previa" } }),
        JSON.stringify({ message: { role: "assistant", content: "respuesta previa" } }),
      ].join("\n"),
      "utf8",
    );

    const cfg: Config = {
      enabled: true,
      messageMode: "llm",
      geminiApiKey: "dummy",
      openRouterApiKey: undefined,
    };
    const payload: HookPayload = {
      hook_event_name: "UserPromptSubmit",
      prompt: "nueva petición",
      transcript_path: transcriptPath,
    };

    mockGemini("respuesta narrada");
    const out = await buildMessage(payload, cfg);
    assert.equal(out, "respuesta narrada");

    // La tríada [prevUser, lastAssistant, currentPrompt] llega a Gemini con
    // assistant→model y user→user (§3.3).
    assert.deepEqual((lastBody as { contents: unknown[] }).contents, [
      { role: "user", parts: [{ text: "petición previa" }] },
      { role: "model", parts: [{ text: "respuesta previa" }] },
      { role: "user", parts: [{ text: "nueva petición" }] },
    ]);
  } finally {
    restoreEnv();
  }
});
