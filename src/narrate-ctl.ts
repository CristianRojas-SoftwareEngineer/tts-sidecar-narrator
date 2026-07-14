// Superficie de control de la narración (para la skill opcional y uso manual).
// Escribe/lee config.json en el state dir. No participa en el flujo de hooks.
//
// Uso: node dist/narrate-ctl.js <comando> [args]
//   on                 activa la narración
//   off                desactiva la narración
//   mode <llm|local>   fija el modo de generación
//   status             muestra el estado (sin revelar las claves)
//   say "<texto>"      narra un texto a demanda vía tts-sidecar
import { spawnSync } from "node:child_process";
import { loadConfig, updateConfig } from "./lib/config.js";
import { configPath, stateDir } from "./lib/state-dir.js";
import { resolveCli, needsShell } from "./lib/resolve-cli.js";

function printStatus(): void {
  const cfg = loadConfig();
  const lines = [
    `enabled:      ${cfg.enabled}`,
    `messageMode:  ${cfg.messageMode}`,
    `gemini key:   ${cfg.geminiApiKey ? "configurada" : "ausente"}`,
    `openrouter:   ${cfg.openRouterApiKey ? "configurada" : "ausente"}`,
    `config:       ${configPath()}`,
    `state dir:    ${stateDir()}`,
  ];
  console.log(lines.join("\n"));
}

function say(text: string): number {
  const cli = resolveCli();
  if (!cli) {
    console.error("tts-sidecar no está en el PATH; no se puede narrar.");
    return 1;
  }
  const res = spawnSync(cli, ["speak", "--text", text, "--daemon"], {
    stdio: "inherit",
    windowsHide: true,
    shell: needsShell(cli),
  });
  return res.status ?? 0;
}

function main(): number {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "on":
      updateConfig({ enabled: true });
      console.log("Narración activada.");
      return 0;
    case "off":
      updateConfig({ enabled: false });
      console.log("Narración desactivada.");
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
    case undefined:
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
