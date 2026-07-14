// WORKER (proceso independiente del hook). Hace todo el trabajo con latencia:
// single-instance con interrupción del anterior, construcción del mensaje,
// narración vía el CLI. Degrada en silencio; los errores van a worker.log.
import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { loadConfig } from "./lib/config.js";
import {
  ensureStateDir,
  payloadPath,
  workerLogPath,
  workerPidPath,
} from "./lib/state-dir.js";
import { isAlive, killWorkerTree } from "./lib/spawn.js";
import { resolveCli, needsShell } from "./lib/resolve-cli.js";
import { parsePayload, type HookPayload } from "./lib/hook-payload.js";
import { buildMessage } from "./message/build-message.js";

function log(msg: string): void {
  try {
    appendFileSync(workerLogPath(), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // El logging nunca debe tumbar al worker.
  }
}

/** Interrumpe al worker anterior (última narración gana) y registra el propio PID. */
function takeSingleInstance(): void {
  try {
    const prev = Number.parseInt(readFileSync(workerPidPath(), "utf8").trim(), 10);
    if (Number.isInteger(prev) && prev !== process.pid && isAlive(prev)) {
      killWorkerTree(prev);
    }
  } catch {
    // Sin worker previo.
  }
  writeFileSync(workerPidPath(), String(process.pid), "utf8");
}

function releaseSingleInstance(): void {
  try {
    const owner = Number.parseInt(readFileSync(workerPidPath(), "utf8").trim(), 10);
    if (owner === process.pid) rmSync(workerPidPath(), { force: true });
  } catch {
    // Nada que liberar.
  }
}

function readPayload(): HookPayload {
  try {
    return parsePayload(readFileSync(payloadPath(), "utf8"));
  } catch {
    return {};
  }
}

/** Ejecuta `tts-sidecar speak --text <texto> --daemon`. Resuelve al terminar. */
function runSpeak(cliPath: string, text: string): Promise<void> {
  return new Promise((resolve) => {
    const args = ["speak", "--text", text, "--daemon"];
    const child = spawn(cliPath, args, {
      stdio: "ignore",
      windowsHide: true,
      shell: needsShell(cliPath),
    });
    child.on("error", (err) => {
      log(`speak error: ${err.message}`);
      resolve();
    });
    child.on("exit", (code) => {
      if (code !== 0) log(`speak salió con código ${code}`);
      resolve();
    });
  });
}

async function main(): Promise<void> {
  ensureStateDir();
  takeSingleInstance();

  const cfg = loadConfig();
  if (!cfg.enabled) return;

  const payload = readPayload();

  const text = await buildMessage(payload, cfg);
  if (!text) {
    log("mensaje vacío tras la construcción; nada que narrar");
    return;
  }

  const cli = resolveCli();
  if (!cli) {
    log("tts-sidecar no encontrado en PATH; se omite la narración");
    return;
  }

  await runSpeak(cli, text);
}

main()
  .catch((err) => log(`worker error: ${err?.message ?? err}`))
  .finally(() => {
    releaseSingleInstance();
    process.exit(0);
  });
