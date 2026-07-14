// Modelo del JSON que Claude Code entrega por stdin a cada hook. Solo se tipan
// los campos que el plugin consume; el resto se ignora.
export interface HookPayload {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  transcript_path?: string;
  /** Presente en Stop: último mensaje del asistente en el turno. */
  last_assistant_message?: string;
  /** Presente en Notification: aviso ya redactado y corto. */
  message?: string;
}

/** Parseo tolerante: nunca lanza; ante entrada inválida devuelve un objeto vacío. */
export function parsePayload(raw: string): HookPayload {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as HookPayload;
  } catch {
    // Entrada vacía o malformada.
  }
  return {};
}

/** Lee stdin completo como texto. Resuelve con "" si no hay entrada. */
export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const stdin = process.stdin;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    stdin.on("data", (c: Buffer) => chunks.push(c));
    stdin.on("end", done);
    stdin.on("error", done);
    stdin.on("close", done);
  });
}
