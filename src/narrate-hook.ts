// LAUNCHER (fire-and-forget). Corre DENTRO del hook de Claude Code: lee el
// payload, decide si narrar, lo persiste y lanza el worker desanclado. Debe
// salir en <100 ms — nada de red, síntesis ni espera. Sirve a Stop y
// Notification (el worker distingue el evento por hook_event_name).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./lib/config.js";
import { ensureStateDir, payloadPath } from "./lib/state-dir.js";
import { spawnDetached } from "./lib/spawn.js";
import { readStdin, parsePayload } from "./lib/hook-payload.js";

async function main(): Promise<void> {
  const raw = await readStdin();

  // Toggle global: si está desactivado, salir sin efectos.
  const cfg = loadConfig();
  if (!cfg.enabled) return;

  const payload = parsePayload(raw);

  // Persistir el payload para el worker (traspaso launcher → worker).
  ensureStateDir();
  writeFileSync(payloadPath(), JSON.stringify(payload), "utf8");

  // Lanzar el worker desanclado con el mismo Node que ejecuta este launcher.
  const here = dirname(fileURLToPath(import.meta.url));
  const worker = join(here, "narrate-worker.js");
  spawnDetached(process.execPath, [worker]);
}

// El launcher nunca falla la sesión: cualquier error se traga y sale 0.
main()
  .catch(() => {})
  .finally(() => process.exit(0));
