// Superficie de control de la narración (para la skill opcional y uso manual).
// Escribe/lee config.json en el state dir. No participa en el flujo de hooks.
//
// Uso: node dist/narrate-ctl.js <comando> [args]
//   on                 activa la narración
//   off                desactiva la narración
//   mode <llm|local>   fija el modo de generación
//   status             muestra el estado (sin revelar las claves)
//   say "<texto>"      narra un texto a demanda vía tts-sidecar
//   bake               hornea los avisos estáticos pre-sintetizados (idempotente)
import { spawnSync } from "node:child_process";
import { loadConfig, updateConfig } from "./lib/config.js";
import { configPath, stateDir } from "./lib/state-dir.js";
import { resolveCli, needsShell } from "./lib/resolve-cli.js";
import { AVISOS } from "./message/static-avisos.js";

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
  const res = spawnSync(cli, ["speech", "say", "--text", text, "--daemon"], {
    stdio: "inherit",
    windowsHide: true,
    shell: needsShell(cli),
  });
  return res.status ?? 0;
}

/**
 * Hornea los avisos del catálogo con `speech synthesize --daemon`. Idempotente
 * por construcción: el label es hash del texto, así que la colisión de label
 * (exit `6`) significa «ya horneado» y cuenta como éxito. Requiere el daemon
 * caliente (exit `5` si está caído) y el modelo provisionado (exit `4`).
 */
function bake(): number {
  const cli = resolveCli();
  if (!cli) {
    console.error("tts-sidecar no está en el PATH; no se puede hornear.");
    return 1;
  }
  let failed = false;
  for (const [evento, { text, label }] of Object.entries(AVISOS)) {
    const res = spawnSync(
      cli,
      ["speech", "synthesize", "--text", text, "--label", label, "--daemon"],
      {
        stdio: ["ignore", "ignore", "inherit"],
        windowsHide: true,
        shell: needsShell(cli),
      },
    );
    const code = res.status ?? 1;
    if (code === 0) console.log(`${evento}: horneado (${label})`);
    else if (code === 6) console.log(`${evento}: ya horneado (${label})`);
    else {
      failed = true;
      const motivo =
        code === 5
          ? " — daemon caído; levántalo con `tts-sidecar daemon start`"
          : code === 4
            ? " — modelo ausente; provisiónalo con `tts-sidecar setup`"
            : "";
      console.error(`${evento}: fallo (exit ${code})${motivo}`);
    }
  }
  return failed ? 1 : 0;
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
    case "bake":
      return bake();
    default:
      console.error(`Comando desconocido: ${cmd}`);
      return 2;
  }
}

process.exit(main());
