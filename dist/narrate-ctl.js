// Generado por build.mjs (esbuild). No editar a mano; editar src/ y recompilar.

// src/narrate-ctl.ts
import { spawnSync } from "node:child_process";

// src/lib/config.ts
import { readFileSync, writeFileSync } from "node:fs";

// src/lib/state-dir.ts
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
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
function ensureStateDir() {
  const dir = stateDir();
  mkdirSync(dir, { recursive: true });
  return dir;
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
function updateConfig(patch) {
  ensureStateDir();
  const current = readFileConfig();
  const merged = { ...current, ...patch };
  writeFileSync(configPath(), JSON.stringify(merged, null, 2) + "\n", {
    mode: 384
  });
  return loadConfig();
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

// src/narrate-ctl.ts
function printStatus() {
  const cfg = loadConfig();
  const lines = [
    `enabled:      ${cfg.enabled}`,
    `messageMode:  ${cfg.messageMode}`,
    `gemini key:   ${cfg.geminiApiKey ? "configurada" : "ausente"}`,
    `openrouter:   ${cfg.openRouterApiKey ? "configurada" : "ausente"}`,
    `config:       ${configPath()}`,
    `state dir:    ${stateDir()}`
  ];
  console.log(lines.join("\n"));
}
function say(text) {
  const cli = resolveCli();
  if (!cli) {
    console.error("tts-sidecar no est\xE1 en el PATH; no se puede narrar.");
    return 1;
  }
  const res = spawnSync(cli, ["speak", "--text", text, "--daemon"], {
    stdio: "inherit",
    windowsHide: true,
    shell: needsShell(cli)
  });
  return res.status ?? 0;
}
function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "on":
      updateConfig({ enabled: true });
      console.log("Narraci\xF3n activada.");
      return 0;
    case "off":
      updateConfig({ enabled: false });
      console.log("Narraci\xF3n desactivada.");
      return 0;
    case "mode": {
      const mode = rest[0];
      if (mode !== "llm" && mode !== "local") {
        console.error("Uso: mode <llm|local>");
        return 2;
      }
      updateConfig({ messageMode: mode });
      console.log(`messageMode = ${mode}`);
      return 0;
    }
    case "status":
    case void 0:
      printStatus();
      return 0;
    case "say": {
      const text = rest.join(" ").trim();
      if (!text) {
        console.error('Uso: say "<texto>"');
        return 2;
      }
      return say(text);
    }
    default:
      console.error(`Comando desconocido: ${cmd}`);
      return 2;
  }
}
process.exit(main());
