// Consulta y arranque del daemon de TTS-Sidecar vía su CLI pública. El daemon
// mantiene el modelo en memoria: `speak --daemon` lo requiere corriendo (no lo
// arranca solo). El health-check lo levanta de forma desanclada al iniciar sesión.
import { spawn, spawnSync } from "node:child_process";
import { needsShell } from "./resolve-cli.js";

/**
 * ¿El daemon está en ejecución? Consulta síncrona y barata (`daemon status
 * --json`), sin cargar el modelo. Devuelve false ante cualquier fallo o duda.
 */
export function isDaemonRunning(cliPath: string): boolean {
  try {
    const res = spawnSync(cliPath, ["daemon", "status", "--json"], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
      shell: needsShell(cliPath),
    });
    if (res.error || typeof res.stdout !== "string" || !res.stdout.trim()) {
      return false;
    }
    const status = JSON.parse(res.stdout) as { running?: unknown };
    return status.running === true;
  } catch {
    return false;
  }
}

/**
 * Arranca el daemon de forma desanclada (fire-and-forget): la carga del modelo
 * (~15-20 s) ocurre en segundo plano y no bloquea el hook de SessionStart. No se
 * espera ni se comprueba el resultado; si falla, el health-check no molesta.
 */
export function startDaemonDetached(cliPath: string): void {
  try {
    const child = spawn(cliPath, ["daemon", "start"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: needsShell(cliPath),
    });
    child.unref();
  } catch {
    // Sin ruido: el arranque del daemon es best-effort.
  }
}
