// Hook de SessionStart: verifica una sola vez por sesión que la cadena de
// narración está completa (CLI en PATH + modelo cacheado) y, si todo está listo,
// deja el daemon en marcha para que speak --daemon esté caliente durante la
// sesión (elimina el arranque manual tras un reinicio). Ante una carencia, avisa
// al usuario con el campo systemMessage del JSON de salida (único mecanismo de
// aviso portable). Nunca falla la sesión: exit 0 siempre.
import { spawnSync } from "node:child_process";
import { loadConfig } from "./lib/config.js";
import { resolveCli, needsShell } from "./lib/resolve-cli.js";
import { readStdin } from "./lib/hook-payload.js";
import { isDaemonRunning, startDaemonDetached } from "./lib/daemon.js";

interface DoctorReport {
  status: "ok" | "failed";
  issues?: string[];
  data_dir?: string;
  hf_cache?: string;
  base_status?: string;
}

/**
 * Extrae el primer objeto JSON de nivel superior del texto y lo parsea. En caso
 * de fallo, `doctor --json` concatena dos objetos (el reporte y un {error,…});
 * el recorrido por profundidad de llaves (respetando cadenas y escapes) toma
 * solo el primero e ignora cualquier objeto posterior. Devuelve undefined si no
 * hay un objeto balanceado o el fragmento no parsea.
 */
function parseFirstJsonObject(text: string): DoctorReport | undefined {
  const start = text.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as DoctorReport;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

/** Emite un aviso al usuario y termina la sesión sin bloquearla. */
function notify(message: string): never {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

function ok(): never {
  process.exit(0);
}

async function main(): Promise<void> {
  await readStdin(); // drena stdin; el contenido no se usa aquí

  const cfg = loadConfig();
  if (!cfg.enabled) ok();

  const cli = resolveCli();
  if (!cli) {
    notify(
      "tts-sidecar-narrator: AI-Voice-InterConnector no está en el PATH. Instálalo y ejecuta " +
        "ai-voice-interconnector setup para habilitar la narración por voz.",
    );
  }

  // doctor --json imprime el reporte aun cuando falla (exit != 0 si hay FAIL).
  const res = spawnSync(cli, ["doctor", "--json"], {
    encoding: "utf8",
    timeout: 20000,
    windowsHide: true,
    shell: needsShell(cli),
  });

  // Si no se pudo ejecutar el diagnóstico, no molestar (no hay dato accionable).
  if (res.error || typeof res.stdout !== "string" || !res.stdout.trim()) ok();

  // Se toma solo el primer objeto JSON: en caso de fallo el stdout trae el
  // reporte y un {error,…} concatenado que rompería un JSON.parse del total.
  const report = parseFirstJsonObject(res.stdout);
  if (!report) ok();

  if (report.status === "failed") {
    notify(
      "tts-sidecar-narrator: el entorno de voz no está provisionado. Ejecuta " +
        "ai-voice-interconnector setup para habilitar la narración por voz.",
    );
  }

  // Todo listo (status ok) y la narración está activada (se comprobó arriba):
  // deja el daemon caliente para la sesión. Fire-and-forget, sin bloquear ni
  // molestar si falla.
  if (report.status === "ok" && !isDaemonRunning(cli)) {
    startDaemonDetached(cli);
  }

  ok();
}

main().catch(() => process.exit(0));
