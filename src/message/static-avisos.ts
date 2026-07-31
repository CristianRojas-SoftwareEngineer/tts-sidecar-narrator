// Registro único de los avisos estáticos pre-sintetizados: texto canónico y
// label derivado del hash del texto. El worker deriva el label para
// `speech play`, `narrate-ctl bake` lo deriva para `speech synthesize` y el
// builder decide qué eventos lo usan — todos desde este catálogo, así una frase
// que cambia produce un label nuevo y nunca se reproduce el WAV viejo por
// accidente.
import { createHash } from "node:crypto";

/** Aviso estático: texto canónico y label estable derivado de él. */
export interface Aviso {
  text: string;
  label: string;
}

/**
 * Petición de narración que el builder entrega al worker: reproducir un aviso
 * pre-sintetizado (`speech play`, sin modelo ni daemon) o sintetizar un texto
 * dinámico (`speech say`, exige daemon).
 */
export type NarrationRequest =
  | { kind: "play"; label: string }
  | { kind: "say"; text: string };

/**
 * Label estable para un texto: `narrator-<sha256 hex truncado a 12>`. Cumple el
 * contrato de labels del motor (`[a-z0-9._-]+`, minúsculas) y es determinista:
 * mismo texto → mismo label; texto distinto → label distinto.
 */
export function labelFor(text: string): string {
  const hash = createHash("sha256").update(text, "utf8").digest("hex");
  return `narrator-${hash.slice(0, 12)}`;
}

function aviso(text: string): Aviso {
  return { text, label: labelFor(text) };
}

/**
 * Catálogo de los seis avisos pre-sintetizados: el acuse fijo de
 * `UserPromptSubmit` y los fallbacks estáticos de último recurso por evento
 * (más el default para eventos desconocidos).
 */
export const AVISOS = {
  UserPromptSubmit: aviso("Procesando con Claude"),
  Stop: aviso("El asistente terminó su turno."),
  SubagentStop: aviso("El subagente completó su trabajo."),
  StopFailure: aviso("Ocurrió un error durante la ejecución."),
  Notification: aviso("Claude necesita tu atención"),
  Default: aviso("Procesando."),
} as const satisfies Record<string, Aviso>;
