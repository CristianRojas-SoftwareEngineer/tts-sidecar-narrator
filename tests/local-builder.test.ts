// El modo de degradación por defecto (sin red): si esto se rompe, se rompe la
// narración para todo usuario sin claves configuradas.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalSummary,
  staticForEvent,
  buildNotice,
} from "../src/message/local-builder.js";

test("buildLocalSummary conserva TODAS las oraciones (sin truncar)", () => {
  assert.equal(
    buildLocalSummary("Se corrigió el error. Los tests pasan. Queda pendiente el CI."),
    "Se corrigió el error. Los tests pasan. Queda pendiente el CI.",
  );
});

test("buildLocalSummary devuelve vacío solo si no queda prosa", () => {
  assert.equal(buildLocalSummary(""), "");
  // El contenido de un bloque de código se conserva (ruta pronunciable).
  assert.equal(
    buildLocalSummary("```\nsolo un bloque de código\n```"),
    "solo un bloque de código",
  );
});

test("staticForEvent conoce los eventos con texto propio", () => {
  assert.equal(staticForEvent("Stop"), "El asistente terminó su turno.");
  assert.equal(staticForEvent("UserPromptSubmit"), "Solicitud recibida. Procesando con Claude.");
  assert.equal(staticForEvent("SubagentStop"), "El subagente completó su trabajo.");
  assert.equal(staticForEvent("StopFailure"), "Ocurrió un error durante la ejecución.");
  assert.equal(staticForEvent("Notification"), "Claude necesita tu atención");
  assert.equal(staticForEvent("SessionStart"), "Sesión iniciada");
});

test("staticForEvent cae al texto por defecto ante eventos desconocidos", () => {
  assert.equal(staticForEvent("SubagentStop_inexistente"), "Procesando.");
  assert.equal(staticForEvent(undefined), "Procesando.");
});

test("buildNotice limpia el mensaje para voz", () => {
  assert.equal(
    buildNotice("Claude necesita **permiso** para usar `Bash`"),
    "Claude necesita permiso para usar Bash",
  );
});

test("buildNotice cae al estático de Notification si el mensaje queda vacío", () => {
  assert.equal(buildNotice(""), "Claude necesita tu atención");
  assert.equal(buildNotice(undefined), "Claude necesita tu atención");
});
