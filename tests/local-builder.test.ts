// El modo de degradación por defecto (sin red): si esto se rompe, se rompe la
// narración para todo usuario sin claves configuradas.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalSummary,
  staticForEvent,
  buildNotice,
} from "../src/message/local-builder.js";

test("buildLocalSummary resume prosa normal", () => {
  assert.equal(
    buildLocalSummary("Se corrigió el error. Los tests pasan. Queda pendiente el CI."),
    "Se corrigió el error. Los tests pasan.",
  );
});

test("buildLocalSummary devuelve vacío si no hay prosa utilizable", () => {
  assert.equal(buildLocalSummary(""), "");
  assert.equal(buildLocalSummary("```\nsolo un bloque de código\n```"), "");
});

test("staticForEvent conoce los eventos con texto propio", () => {
  assert.equal(staticForEvent("Stop"), "El asistente terminó su turno");
  assert.equal(staticForEvent("Notification"), "Claude necesita tu atención");
  assert.equal(staticForEvent("SessionStart"), "Sesión iniciada");
});

test("staticForEvent cae al texto por defecto ante eventos desconocidos", () => {
  assert.equal(staticForEvent("SubagentStop"), "El asistente completó una acción");
  assert.equal(staticForEvent(undefined), "El asistente completó una acción");
});

test("buildNotice limpia el mensaje para voz", () => {
  assert.equal(
    buildNotice("Claude necesita **permiso** para usar `Bash`"),
    "Claude necesita permiso para usar",
  );
});

test("buildNotice cae al estático de Notification si el mensaje queda vacío", () => {
  assert.equal(buildNotice(""), "Claude necesita tu atención");
  assert.equal(buildNotice(undefined), "Claude necesita tu atención");
});
