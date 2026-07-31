// Caracterización de buildMessage: enrutado de eventos hacia peticiones de
// narración (`say` dinámico / `play` de aviso pre-sintetizado), acuse fijo de
// UserPromptSubmit y mapeo de roles (§3.3) contra Gemini.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMessage } from "../src/message/build-message.js";
import { AVISOS } from "../src/message/static-avisos.js";
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

test("UserPromptSubmit es un acuse fijo: play del aviso horneado, ignora el prompt", async () => {
  const out = await buildMessage(
    { hook_event_name: "UserPromptSubmit", prompt: "haz X" },
    LOCAL,
  );
  assert.deepEqual(out, { kind: "play", label: AVISOS.UserPromptSubmit.label });
});

test("SubagentStop (local) cae al aviso pre-sintetizado del evento", async () => {
  const out = await buildMessage({ hook_event_name: "SubagentStop" }, LOCAL);
  assert.deepEqual(out, { kind: "play", label: AVISOS.SubagentStop.label });
});

test("StopFailure (local) cae al aviso pre-sintetizado del evento", async () => {
  const out = await buildMessage({ hook_event_name: "StopFailure" }, LOCAL);
  assert.deepEqual(out, { kind: "play", label: AVISOS.StopFailure.label });
});

test("Stop (local) sin last_assistant cae al aviso pre-sintetizado", async () => {
  const out = await buildMessage({ hook_event_name: "Stop" }, LOCAL);
  assert.deepEqual(out, { kind: "play", label: AVISOS.Stop.label });
});

test("Stop (local) con last_assistant narra el resumen local vía say", async () => {
  const out = await buildMessage(
    { hook_event_name: "Stop", last_assistant_message: "Terminé la tarea." },
    LOCAL,
  );
  assert.deepEqual(out, { kind: "say", text: "Terminé la tarea." });
});

test("Notification usa su texto propio vía say", async () => {
  const out = await buildMessage(
    { hook_event_name: "Notification", message: "**Atención**" },
    LOCAL,
  );
  assert.deepEqual(out, { kind: "say", text: "Atención" });
});

test("Notification sin mensaje cae al aviso pre-sintetizado", async () => {
  const out = await buildMessage({ hook_event_name: "Notification" }, LOCAL);
  assert.deepEqual(out, { kind: "play", label: AVISOS.Notification.label });
});

// --- Modo summary vía Gemini (fetch mockeado) ---

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

test("UserPromptSubmit (llm) NO invoca ningún LLM: acuse fijo play", async () => {
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
      prompt: "nueva petición",
    };

    mockGemini("no debería llamarse");
    const out = await buildMessage(payload, cfg);
    assert.deepEqual(out, { kind: "play", label: AVISOS.UserPromptSubmit.label });
    assert.equal(lastBody, undefined);
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
    assert.deepEqual(out, { kind: "say", text: "Creé el componente principal" });

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

test("Stop (llm) sin last_assistant_message ni transcript degrada limpiamente al aviso play", async () => {
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
    assert.deepEqual(out, { kind: "play", label: AVISOS.Stop.label });
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
      hook_event_name: "Stop",
      last_assistant_message: "Prueba realizada",
      transcript_path: transcriptPath,
    };

    mockGemini("Realicé la prueba");
    const out = await buildMessage(payload, cfg);
    assert.deepEqual(out, { kind: "say", text: "Realicé la prueba" });

    assert.deepEqual((lastBody as { contents: unknown[] }).contents, [
      { role: "user", parts: [{ text: "Hola asistente" }] },
      { role: "model", parts: [{ text: "Hola usuario" }] },
      { role: "user", parts: [{ text: "Haz la prueba" }] },
      { role: "model", parts: [{ text: "Prueba realizada" }] },
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
      hook_event_name: "Stop",
      last_assistant_message: "Trabajo hecho",
      transcript_path: transcriptPath,
    };

    mockGemini("Procesando");
    const out = await buildMessage(payload, cfg);
    assert.deepEqual(out, { kind: "say", text: "Procesando" });

    assert.deepEqual((lastBody as { contents: unknown[] }).contents, [
      { role: "user", parts: [{ text: "Petición válida" }] },
      { role: "model", parts: [{ text: "Trabajo hecho" }] },
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
