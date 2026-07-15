// La superficie que invoca la skill: cada subcomando de narrate-ctl como
// subproceso real sobre dist/narrate-ctl.js (check-dist garantiza que dist/
// refleja src/), con el state dir redirigido a un temporal vía env vars del SO
// anfitrión. El test de status fija por contrato que las claves jamás se
// imprimen.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir, removeDir } from "./helpers.js";

const CTL = join(process.cwd(), "dist", "narrate-ctl.js");

let stateBase: string;

beforeEach(() => {
  stateBase = makeTempDir("narrator-ctl-");
});

afterEach(() => {
  removeDir(stateBase);
});

/** Env que redirige el state dir al temporal según el SO real del host. */
function ctlEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GEMINI_API_KEY;
  delete env.OPENROUTER_API_KEY;
  Object.assign(env, extra);
  if (process.platform === "win32") env.LOCALAPPDATA = stateBase;
  else if (process.platform === "darwin") env.HOME = stateBase;
  else env.XDG_STATE_HOME = stateBase;
  return env;
}

function runCtl(
  args: string[],
  extraEnv: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, [CTL, ...args], {
    env: ctlEnv(extraEnv),
    encoding: "utf8",
    windowsHide: true,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function readConfigFile(): Record<string, unknown> {
  const sub =
    process.platform === "darwin"
      ? join("Library", "Application Support")
      : "";
  const path = join(stateBase, sub, "tts-sidecar-narrator", "config.json");
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

test("on activa la narración y lo persiste", () => {
  const res = runCtl(["on"]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /activada/);
  assert.equal(readConfigFile().enabled, true);
});

test("off desactiva la narración y lo persiste", () => {
  const res = runCtl(["off"]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /desactivada/);
  assert.equal(readConfigFile().enabled, false);
});

test("mode fija llm o local; un valor inválido devuelve 2 con uso", () => {
  assert.equal(runCtl(["mode", "local"]).status, 0);
  assert.equal(readConfigFile().messageMode, "local");
  assert.equal(runCtl(["mode", "llm"]).status, 0);
  assert.equal(readConfigFile().messageMode, "llm");

  const bad = runCtl(["mode", "turbo"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Uso: mode/);
});

test("status reporta el estado y jamás imprime el valor de una clave", () => {
  const sentinel = "sk-CLAVE-QUE-NO-DEBE-APARECER";
  const res = runCtl(["status"], { GEMINI_API_KEY: sentinel });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /enabled:/);
  assert.match(res.stdout, /messageMode:/);
  assert.match(res.stdout, /gemini key: {3}configurada/);
  assert.match(res.stdout, /openrouter: {3}ausente/);
  assert.ok(!res.stdout.includes(sentinel));
  assert.ok(!res.stderr.includes(sentinel));
});

test("sin comando equivale a status", () => {
  const res = runCtl([]);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /enabled:/);
});

test("un comando desconocido devuelve 2", () => {
  const res = runCtl(["bailar"]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Comando desconocido/);
});

test("say sin texto devuelve 2 con uso", () => {
  const res = runCtl(["say", "   "]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Uso: say/);
});

test("say sin tts-sidecar en el PATH devuelve 1 con aviso", () => {
  const emptyPath = makeTempDir("narrator-empty-");
  try {
    const res = runCtl(["say", "hola"], { PATH: emptyPath, Path: emptyPath });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /no está en el PATH/);
  } finally {
    removeDir(emptyPath);
  }
});
