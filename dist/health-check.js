// Generado por build.mjs (esbuild). No editar a mano; editar src/ y recompilar.

// src/health-check.ts
import { spawnSync as spawnSync2 } from "node:child_process";

// src/lib/config.ts
import { readFileSync, writeFileSync } from "node:fs";

// src/lib/state-dir.ts
import { homedir, platform } from "node:os";
import { join } from "node:path";
var APP_DIR = "tts-sidecar-narrator";
function stateDir() {
  const home = homedir();
  switch (platform()) {
    case "win32": {
      const base = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
      return join(base, APP_DIR);
    }
    case "darwin":
      return join(home, "Library", "Application Support", APP_DIR);
    default: {
      const base = process.env.XDG_STATE_HOME ?? join(home, ".local", "state");
      return join(base, APP_DIR);
    }
  }
}
function configPath() {
  return join(stateDir(), "config.json");
}

// src/lib/config.ts
var DEFAULTS = {
  enabled: true,
  messageMode: "llm"
};
function readFileConfig() {
  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
  }
  return {};
}
function loadConfig() {
  const file = readFileConfig();
  const cfg = {
    enabled: typeof file.enabled === "boolean" ? file.enabled : DEFAULTS.enabled,
    messageMode: file.messageMode === "local" ? "local" : DEFAULTS.messageMode,
    geminiApiKey: emptyToUndef(file.geminiApiKey),
    openRouterApiKey: emptyToUndef(file.openRouterApiKey)
  };
  const envGemini = emptyToUndef(process.env.GEMINI_API_KEY);
  const envOpenRouter = emptyToUndef(process.env.OPENROUTER_API_KEY);
  if (envGemini) cfg.geminiApiKey = envGemini;
  if (envOpenRouter) cfg.openRouterApiKey = envOpenRouter;
  return cfg;
}
function emptyToUndef(v) {
  return typeof v === "string" && v.trim() !== "" ? v : void 0;
}

// src/lib/resolve-cli.ts
import { existsSync, statSync } from "node:fs";
import { delimiter, join as join2 } from "node:path";
var BASE = "tts-sidecar";
function candidateNames() {
  if (process.platform !== "win32") return [BASE];
  const exts = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").map((e) => e.trim()).filter(Boolean);
  return [...exts.map((e) => BASE + e.toLowerCase()), BASE];
}
function resolveCli() {
  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  const names = candidateNames();
  for (const dir of dirs) {
    for (const name of names) {
      const full = join2(dir, name);
      try {
        if (existsSync(full) && statSync(full).isFile()) return full;
      } catch {
      }
    }
  }
  return void 0;
}
function needsShell(cliPath) {
  if (process.platform !== "win32") return false;
  const lower = cliPath.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

// src/lib/hook-payload.ts
function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    const stdin = process.stdin;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    stdin.on("data", (c) => chunks.push(c));
    stdin.on("end", done);
    stdin.on("error", done);
    stdin.on("close", done);
  });
}

// src/lib/daemon.ts
import { spawn, spawnSync } from "node:child_process";
function isDaemonRunning(cliPath) {
  try {
    const res = spawnSync(cliPath, ["daemon", "status", "--json"], {
      encoding: "utf8",
      timeout: 1e4,
      windowsHide: true,
      shell: needsShell(cliPath)
    });
    if (res.error || typeof res.stdout !== "string" || !res.stdout.trim()) {
      return false;
    }
    const status = JSON.parse(res.stdout);
    return status.running === true;
  } catch {
    return false;
  }
}
function startDaemonDetached(cliPath) {
  try {
    const child = spawn(cliPath, ["daemon", "start"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: needsShell(cliPath)
    });
    child.unref();
  } catch {
  }
}

// src/health-check.ts
function notify(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}
function ok() {
  process.exit(0);
}
async function main() {
  await readStdin();
  const cfg = loadConfig();
  if (!cfg.enabled) ok();
  const cli = resolveCli();
  if (!cli) {
    notify(
      "tts-sidecar-narrator: TTS-Sidecar no est\xE1 en el PATH. Inst\xE1lalo y ejecuta tts-sidecar setup para habilitar la narraci\xF3n por voz."
    );
  }
  const res = spawnSync2(cli, ["doctor", "--json"], {
    encoding: "utf8",
    timeout: 2e4,
    windowsHide: true,
    shell: needsShell(cli)
  });
  if (res.error || typeof res.stdout !== "string" || !res.stdout.trim()) ok();
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    ok();
  }
  const modelCheck = (report.checks ?? []).find((c) => c.name === "Chatterbox model");
  if (modelCheck?.status === "FAIL") {
    notify(
      "tts-sidecar-narrator: el modelo de voz no est\xE1 descargado. Ejecuta tts-sidecar setup para habilitar la narraci\xF3n por voz."
    );
  }
  if (modelCheck?.status === "PASS" && !isDaemonRunning(cli)) {
    startDaemonDetached(cli);
  }
  ok();
}
main().catch(() => process.exit(0));
