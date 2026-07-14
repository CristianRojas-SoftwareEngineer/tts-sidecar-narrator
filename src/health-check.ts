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

interface DoctorCheck {
  status?: string;
  name?: string;
  detail?: string;
}
interface DoctorReport {
  checks?: DoctorCheck[];
  failed?: number;
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
      "tts-sidecar-narrator: TTS-Sidecar no está en el PATH. Instálalo y ejecuta " +
        "tts-sidecar setup para habilitar la narración por voz.",
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

  let report: DoctorReport;
  try {
    report = JSON.parse(res.stdout) as DoctorReport;
  } catch {
    ok();
  }

  const modelCheck = (report.checks ?? []).find((c) => c.name === "Chatterbox model");
  if (modelCheck?.status === "FAIL") {
    notify(
      "tts-sidecar-narrator: el modelo de voz no está descargado. Ejecuta " +
        "tts-sidecar setup para habilitar la narración por voz.",
    );
  }

  // Todo listo (CLI + modelo cacheado) y la narración está activada (se comprobó
  // arriba): deja el daemon caliente para la sesión. Fire-and-forget, sin
  // bloquear ni molestar si falla. Solo si el modelo está confirmado en caché.
  if (modelCheck?.status === "PASS" && !isDaemonRunning(cli)) {
    startDaemonDetached(cli);
  }

  ok();
}

main().catch(() => process.exit(0));
