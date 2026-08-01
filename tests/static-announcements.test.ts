// El catálogo de anuncios pre-sintetizados es contrato triple: el worker
// reproduce por label, `presynth` pre-sintetiza por label y ambos deben derivarlo del
// mismo texto. Si un texto cambia, su label debe cambiar con él.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ANNOUNCEMENTS, labelFor } from "../src/message/static-announcements.js";

test("el catálogo fija el texto literal de los seis anuncios", () => {
  assert.equal(ANNOUNCEMENTS.UserPromptSubmit.text, "Procesando con Claude");
  assert.equal(ANNOUNCEMENTS.Stop.text, "El asistente terminó su turno.");
  assert.equal(ANNOUNCEMENTS.SubagentStop.text, "El subagente completó su trabajo.");
  assert.equal(ANNOUNCEMENTS.StopFailure.text, "Ocurrió un error durante la ejecución.");
  assert.equal(ANNOUNCEMENTS.Notification.text, "Claude necesita tu atención");
  assert.equal(ANNOUNCEMENTS.Default.text, "Procesando.");
  assert.equal(Object.keys(ANNOUNCEMENTS).length, 6);
});

test("cada label cumple el contrato del motor: narrator-<12 hex minúscula>", () => {
  for (const { label } of Object.values(ANNOUNCEMENTS)) {
    assert.match(label, /^narrator-[0-9a-f]{12}$/);
  }
});

test("el label de cada anuncio es el hash de su propio texto", () => {
  for (const { text, label } of Object.values(ANNOUNCEMENTS)) {
    assert.equal(label, labelFor(text));
  }
});

test("labelFor es determinista y distingue textos distintos", () => {
  assert.equal(labelFor("hola mundo"), labelFor("hola mundo"));
  assert.notEqual(labelFor("hola mundo"), labelFor("hola mundo."));
  const labels = new Set(Object.values(ANNOUNCEMENTS).map((a) => a.label));
  assert.equal(labels.size, 6);
});
