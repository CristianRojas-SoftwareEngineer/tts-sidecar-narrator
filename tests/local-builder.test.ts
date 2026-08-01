// El destino de degradación por evento (sin red): si esto se rompe, se rompe la
// narración de último recurso para todo usuario sin claves configuradas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { staticForEvent } from "../src/message/local-builder.js";
import { AVISOS } from "../src/message/static-avisos.js";

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
