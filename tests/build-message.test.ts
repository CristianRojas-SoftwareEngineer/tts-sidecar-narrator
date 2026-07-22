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

    assert.deepEqual((lastBody as { contents: unknown[] }).contents, [
      { role: "user", parts: [{ text: "petición previa" }] },
      { role: "model", parts: [{ text: "respuesta previa" }] },
      { role: "user", parts: [{ text: "nueva petición" }] },
    ]);
  } finally {
    restoreEnv();
  }
});

test("UserPromptSubmit (llm) en sesión nueva (sin historial) no alucina ni fuerza tríada", async () => {
  const restoreEnv = withEnv({ GEMINI_API_KEY: "dummy" });
  try {
    const cfg: Config = {
      enabled: true,
      messageMode: "llm",
      geminiApiKey: "dummy",
      openRouterApiKey: undefined,
    };
    const payload: HookPayload = {
      hook_event_name: "UserPromptSubmit",
      prompt: "Hola buenas",
    };

    mockGemini("Hola en que te puedo ayudar");
    const out = await buildMessage(payload, cfg);
    assert.equal(out, "Hola en que te puedo ayudar");

    assert.deepEqual((lastBody as { contents: unknown[] }).contents, [
      { role: "user", parts: [{ text: "Hola buenas" }] },
    ]);
  } finally {
    restoreEnv();
  }
});

test("Stop (llm) incluye last_assistant_message cuando el transcript está vacío", async () => {
  const restoreEnv = withEnv({ GEMINI_API_KEY: "dummy" });
  try {
    const cfg: Config = {
      enabled: true,
      messageMode: "llm",
      geminiApiKey: "dummy",
      openRouterApiKey: undefined,
    };
    const payload: HookPayload = {
      hook_event_name: "Stop",
      last_assistant_message: "Creé el componente principal.",
    };

    mockGemini("Creé el componente principal");
    const out = await buildMessage(payload, cfg);
    assert.equal(out, "Creé el componente principal");

    assert.deepEqual((lastBody as { contents: unknown[] }).contents, [
      { role: "model", parts: [{ text: "Creé el componente principal." }] },
      {
        role: "user",
        parts: [
          {
            text: "Cuéntame en voz alta en primera persona y de forma técnica qué lograste avanzar.",
          },
        ],
      },
    ]);
  } finally {
    restoreEnv();
  }
});

test("Stop (llm) sin last_assistant_message ni transcript degrada limpiamente a fallback local", async () => {
  const restoreEnv = withEnv({ GEMINI_API_KEY: "dummy" });
  try {
    const cfg: Config = {
      enabled: true,
      messageMode: "llm",
      geminiApiKey: "dummy",
      openRouterApiKey: undefined,
    };
    const payload: HookPayload = {
      hook_event_name: "Stop",
      last_assistant_message: "",
    };

    const out = await buildMessage(payload, cfg);
    assert.equal(out, "El asistente terminó su turno.");
    assert.equal(lastBody, undefined);
  } finally {
    restoreEnv();
  }
});

test("readTranscriptMessages parsea esquemas reales de JSONL (USER_INPUT, PLANNER_RESPONSE, USER_EXPLICIT, MODEL)", async () => {
  const restoreEnv = withEnv({ GEMINI_API_KEY: "dummy" });
  try {
    const transcriptPath = join(tmpdir(), `narrator-schemas-${Date.now()}.jsonl`);
    writeFileSync(
      transcriptPath,
      [
        JSON.stringify({ type: "USER_INPUT", content: "Hola asistente" }),
        JSON.stringify({ type: "PLANNER_RESPONSE", content: [{ type: "text", text: "Hola usuario" }] }),
        JSON.stringify({ source: "USER_EXPLICIT", text: "Haz la prueba" }),
        JSON.stringify({ source: "MODEL", payload: { text: "Prueba realizada" } }),
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
      prompt: "Continuar",
      transcript_path: transcriptPath,
    };

    mockGemini("Continuando ejecucion");
    const out = await buildMessage(payload, cfg);
    assert.equal(out, "Continuando ejecucion");

    assert.deepEqual((lastBody as { contents: unknown[] }).contents, [
      { role: "user", parts: [{ text: "Hola asistente" }] },
      { role: "model", parts: [{ text: "Hola usuario" }] },
      { role: "user", parts: [{ text: "Haz la prueba" }] },
      { role: "model", parts: [{ text: "Prueba realizada" }] },
      { role: "user", parts: [{ text: "Continuar" }] },
    ]);
  } finally {
    restoreEnv();
  }
});

test("readTranscriptMessages descarta líneas cortadas/fragmentadas al leer la cola del transcript", async () => {
  const restoreEnv = withEnv({ GEMINI_API_KEY: "dummy" });
  try {
    const transcriptPath = join(tmpdir(), `narrator-fragmented-${Date.now()}.jsonl`);
    writeFileSync(
      transcriptPath,
      [
        '{"type": "USER_INPUT", "content": "Petición válida"}',
        '{"type": "PLANNER_RESPONSE", "content": "Respu', // línea malformada al final
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
      prompt: "Siguiente",
      transcript_path: transcriptPath,
    };

    mockGemini("Procesando");
    const out = await buildMessage(payload, cfg);
    assert.equal(out, "Procesando");

    assert.deepEqual((lastBody as { contents: unknown[] }).contents, [
      { role: "user", parts: [{ text: "Petición válida" }] },
      { role: "user", parts: [{ text: "Siguiente" }] },
    ]);
  } finally {
    restoreEnv();
  }
});
