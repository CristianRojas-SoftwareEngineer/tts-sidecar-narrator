// Resuelve el ejecutable `ai-voice-interconnector` recorriendo el PATH, con las
// extensiones adecuadas por SO. Los instaladores nativos por SO
// (install-windows.ps1, install-linux.sh, install-macos.sh) dejan el CLI en el
// PATH en los tres SO.
import { existsSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";

const BASE = "ai-voice-interconnector";

function candidateNames(): string[] {
  if (process.platform !== "win32") return [BASE];
  // En Windows prioriza el .exe (instalador nativo). Los shims .cmd/.bat exigen
  // shell al ejecutarse (ver runViaShell en el worker).
  const exts = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT")
    .split(";")
    .map((e) => e.trim())
    .filter(Boolean);
  return [...exts.map((e) => BASE + e.toLowerCase()), BASE];
}

/** Ruta absoluta al CLI, o undefined si no está en el PATH. */
export function resolveCli(): string | undefined {
  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  const names = candidateNames();
  for (const dir of dirs) {
    for (const name of names) {
      const full = join(dir, name);
      try {
        if (existsSync(full) && statSync(full).isFile()) return full;
      } catch {
        // Directorio inaccesible: continuar.
      }
    }
  }
  return undefined;
}

/** ¿La ruta resuelta necesita shell para ejecutarse (shim .cmd/.bat en Windows)? */
export function needsShell(cliPath: string): boolean {
  if (process.platform !== "win32") return false;
  const lower = cliPath.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}
