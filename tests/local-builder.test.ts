// El modo de degradación por defecto (sin red): si esto se rompe, se rompe la
// narración para todo usuario sin claves configuradas.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalSummary,
  staticForEvent,
  buildNotice,
} from "../src/message/local-builder.js";
import { AVISOS } from "../src/message/static-avisos.js";

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

test("staticForEvent devuelve el aviso del catálogo para los eventos con texto propio", () => {
  assert.deepEqual(staticForEvent("Stop"), AVISOS.Stop);
  assert.deepEqual(staticForEvent("UserPromptSubmit"), AVISOS.UserPromptSubmit);
  assert.deepEqual(staticForEvent("SubagentStop"), AVISOS.SubagentStop);
  assert.deepEqual(staticForEvent("StopFailure"), AVISOS.StopFailure);
  assert.deepEqual(staticForEvent("Notification"), AVISOS.Notification);
});

test("staticForEvent cae al aviso por defecto ante eventos desconocidos", () => {
  assert.deepEqual(staticForEvent("SubagentStop_inexistente"), AVISOS.Default);
  assert.deepEqual(staticForEvent("SessionStart"), AVISOS.Default);
  assert.deepEqual(staticForEvent(undefined), AVISOS.Default);
});

test("buildNotice limpia el mensaje para voz y lo enruta a say", () => {
  assert.deepEqual(
    buildNotice("Claude necesita **permiso** para usar `Bash`"),
    { kind: "say", text: "Claude necesita permiso para usar Bash" },
  );
});

test("buildNotice cae al aviso pre-sintetizado de Notification si el mensaje queda vacío", () => {
  assert.deepEqual(buildNotice(""), { kind: "play", label: AVISOS.Notification.label });
  assert.deepEqual(buildNotice(undefined), { kind: "play", label: AVISOS.Notification.label });
});
