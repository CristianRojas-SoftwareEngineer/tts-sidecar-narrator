// Generado por build.mjs (esbuild). No editar a mano; editar src/ y recompilar.

// src/narrate-worker.ts
import { spawn as spawn2 } from "node:child_process";
import { appendFileSync, readFileSync as readFileSync2, rmSync, writeFileSync as writeFileSync2 } from "node:fs";

// src/lib/config.ts
import { readFileSync, writeFileSync } from "node:fs";

// src/lib/state-dir.ts
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
var APP_DIR = "tts-sidecar-narrator";
function stateDir() {
  const home = homedir();
  switch (platform()) {
    case "win32": {
      const base = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
      return join(base, APP_DIR);
    }
    case "darwin":
      return join(home, "Library", "Application Support", APP_DIR);
    default: {
      const base = process.env.XDG_STATE_HOME ?? join(home, ".local", "state");
      return join(base, APP_DIR);
    }
  }
}
function ensureStateDir() {
  const dir = stateDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
function configPath() {
  return join(stateDir(), "config.json");
}
function workerPidPath() {
  return join(stateDir(), "worker.pid");
}
function payloadPath() {
  return join(stateDir(), "payload.json");
}
function workerLogPath() {
  return join(stateDir(), "worker.log");
}

// src/lib/config.ts
var DEFAULTS = {
  enabled: true,
  messageMode: "llm"
};
function readFileConfig() {
  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
  }
  return {};
}
function loadConfig() {
  const file = readFileConfig();
  const cfg = {
    enabled: typeof file.enabled === "boolean" ? file.enabled : DEFAULTS.enabled,
    messageMode: file.messageMode === "local" ? "local" : DEFAULTS.messageMode,
    geminiApiKey: emptyToUndef(file.geminiApiKey),
    openRouterApiKey: emptyToUndef(file.openRouterApiKey)
  };
  const envGemini = emptyToUndef(process.env.GEMINI_API_KEY);
  const envOpenRouter = emptyToUndef(process.env.OPENROUTER_API_KEY);
  if (envGemini) cfg.geminiApiKey = envGemini;
  if (envOpenRouter) cfg.openRouterApiKey = envOpenRouter;
  return cfg;
}
function emptyToUndef(v) {
  return typeof v === "string" && v.trim() !== "" ? v : void 0;
}

// src/lib/spawn.ts
import { spawn, spawnSync } from "node:child_process";
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function killWorkerTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
  }
}

// src/lib/resolve-cli.ts
import { existsSync, statSync } from "node:fs";
import { delimiter, join as join2 } from "node:path";
var BASE = "tts-sidecar";
function candidateNames() {
  if (process.platform !== "win32") return [BASE];
  const exts = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").map((e) => e.trim()).filter(Boolean);
  return [...exts.map((e) => BASE + e.toLowerCase()), BASE];
}
function resolveCli() {
  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  const names = candidateNames();
  for (const dir of dirs) {
    for (const name of names) {
      const full = join2(dir, name);
      try {
        if (existsSync(full) && statSync(full).isFile()) return full;
      } catch {
      }
    }
  }
  return void 0;
}
function needsShell(cliPath) {
  if (process.platform !== "win32") return false;
  const lower = cliPath.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

// src/lib/hook-payload.ts
function parsePayload(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
  }
  return {};
}

// src/message/build-message.ts
import { closeSync, openSync, readSync, statSync as statSync2 } from "node:fs";

// src/message/provider-chain.ts
var REQUEST_TIMEOUT_MS = 8e3;
var MAX_OUTPUT_TOKENS = 512;
async function runChain(providers, input) {
  for (const provider of providers) {
    try {
      const text = (await provider.generate(input)).trim();
      if (text) return text;
    } catch {
    }
  }
  return void 0;
}
function buildUserContent(input) {
  const parts = [];
  if (input.transcript.length > 0) {
    parts.push("Contexto reciente de la conversaci\xF3n:");
    parts.push(input.transcript.join("\n"));
    parts.push("");
  }
  parts.push("\xDAltimo mensaje del asistente en este turno:");
  parts.push(input.text);
  return parts.join("\n");
}

// src/message/prompts.ts
var SUMMARY_SYSTEM_PROMPT = "Eres la voz del asistente de programaci\xF3n Claude Code. Recibes el \xFAltimo mensaje del asistente (y, si est\xE1, algo del hilo previo). Narra en alto nivel, en una o dos frases cortas en espa\xF1ol, una s\xEDntesis de lo realizado en el turno. Parafrasea; no expliques detalle t\xE9cnico punto por punto ni enumeres pasos ni menciones nombres de archivos, rutas o comandos. Habla en primera persona. Texto plano para leerse en voz alta: sin markdown, sin asteriscos, comillas, guiones ni s\xEDmbolos. Sin puntos al final de las oraciones.";
function systemPromptFor(mode) {
  switch (mode) {
    case "summary":
      return SUMMARY_SYSTEM_PROMPT;
  }
}

// src/message/gemini-provider.ts
var MODEL = "gemini-2.0-flash";
var ENDPOINT = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
var GeminiProvider = class {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  name = "gemini";
  async generate(input) {
    if (!this.apiKey) throw new Error("Gemini: sin API key");
    const body = {
      systemInstruction: {
        parts: [{ text: systemPromptFor(input.mode) }]
      },
      contents: [
        { role: "user", parts: [{ text: buildUserContent(input) }] }
      ],
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 }
      }
    };
    const res = await fetch(ENDPOINT(MODEL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) throw new Error("Gemini devolvi\xF3 respuesta vac\xEDa");
    return text;
  }
};

// src/message/openrouter-provider.ts
var ENDPOINT2 = "https://openrouter.ai/api/v1/chat/completions";
var MODEL2 = "meta-llama/llama-3.3-70b-instruct:free";
var OpenRouterProvider = class {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  name = "openrouter";
  async generate(input) {
    if (!this.apiKey) throw new Error("OpenRouter: sin API key");
    const body = {
      model: MODEL2,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPromptFor(input.mode) },
        { role: "user", content: buildUserContent(input) }
      ]
    };
    const res = await fetch(ENDPOINT2, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        "x-title": "tts-sidecar-narrator"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("OpenRouter devolvi\xF3 respuesta vac\xEDa");
    return text;
  }
};

// src/message/sanitize.ts
var MAX_CHARS = 320;
function toPlainText(input) {
  let t = input ?? "";
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/~~~[\s\S]*?~~~/g, " ");
  t = t.replace(/`[^`]*`/g, " ");
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/^\s{0,3}>\s?/gm, "");
  t = t.replace(/^\s{0,3}[-*+]\s+/gm, "");
  t = t.replace(/^\s{0,3}\d+[.)]\s+/gm, "");
  t = t.replace(/[*_~]{1,3}/g, "");
  t = t.replace(/[^\p{L}\p{N}\s.,;:¿?¡!()'"-]/gu, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
function firstSentences(text, max = 2) {
  const parts = text.match(/[^.!?]+[.!?]*/g);
  if (!parts) return text;
  return parts.slice(0, max).join(" ").replace(/\s+/g, " ").trim();
}
function sanitizeForSpeech(input, maxSentences = 2) {
  const plain = toPlainText(input);
  if (!plain) return "";
  let out = firstSentences(plain, maxSentences);
  if (out.length > MAX_CHARS) {
    out = out.slice(0, MAX_CHARS).replace(/\s+\S*$/, "").trim();
  }
  return out;
}

// src/message/local-builder.ts
var STATIC_BY_EVENT = {
  Stop: "El asistente termin\xF3 su turno",
  Notification: "Claude necesita tu atenci\xF3n",
  SessionStart: "Sesi\xF3n iniciada"
};
var STATIC_DEFAULT = "El asistente complet\xF3 una acci\xF3n";
function buildLocalSummary(text) {
  return sanitizeForSpeech(text);
}
function staticForEvent(eventName) {
  return STATIC_BY_EVENT[eventName ?? ""] ?? STATIC_DEFAULT;
}
function buildNotice(message) {
  const clean = sanitizeForSpeech(message ?? "");
  return clean || staticForEvent("Notification");
}

// src/message/build-message.ts
var TRANSCRIPT_TAIL_MESSAGES = 3;
var TRANSCRIPT_TAIL_BYTES = 256 * 1024;
async function buildMessage(payload, cfg) {
  const event = payload.hook_event_name;
  if (event === "Notification") {
    return buildNotice(payload.message);
  }
  const primary = (payload.last_assistant_message ?? "").trim();
  if (cfg.messageMode === "llm") {
    const providers = buildProviders(cfg);
    if (providers.length > 0) {
      const input = {
        mode: "summary",
        text: primary,
        transcript: readTranscriptTail(payload.transcript_path)
      };
      const llm = await runChain(providers, input);
      if (llm) {
        const clean = sanitizeForSpeech(llm);
        if (clean) return clean;
      }
    }
  }
  const localSummary = buildLocalSummary(primary);
  if (localSummary) return localSummary;
  return staticForEvent(event);
}
function buildProviders(cfg) {
  const providers = [];
  if (cfg.geminiApiKey) providers.push(new GeminiProvider(cfg.geminiApiKey));
  if (cfg.openRouterApiKey) providers.push(new OpenRouterProvider(cfg.openRouterApiKey));
  return providers;
}
function readTranscriptTail(transcriptPath) {
  if (!transcriptPath) return [];
  let fd;
  try {
    const size = statSync2(transcriptPath).size;
    const start = Math.max(0, size - TRANSCRIPT_TAIL_BYTES);
    const length = size - start;
    if (length <= 0) return [];
    const buf = Buffer.alloc(length);
    fd = openSync(transcriptPath, "r");
    readSync(fd, buf, 0, length, start);
    const chunk = buf.toString("utf8");
    const lines = chunk.split("\n");
    if (start > 0) lines.shift();
    const messages = [];
    for (const line of lines) {
      const entry = extractMessage(line);
      if (entry) messages.push(entry);
    }
    return messages.slice(-TRANSCRIPT_TAIL_MESSAGES);
  } catch {
    return [];
  } finally {
    if (fd !== void 0) {
      try {
        closeSync(fd);
      } catch {
      }
    }
  }
}
function extractMessage(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    const role = obj.message?.role ?? obj.role ?? obj.type;
    if (role !== "user" && role !== "assistant") return null;
    const text = extractText(obj.message?.content);
    if (!text) return null;
    const label = role === "user" ? "usuario" : "asistente";
    return `${label}: ${text}`;
  } catch {
    return null;
  }
}
function extractText(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map(
      (b) => b && typeof b === "object" && typeof b.text === "string" ? b.text : ""
    ).join(" ").replace(/\s+/g, " ").trim();
  }
  return "";
}

// src/narrate-worker.ts
function log(msg) {
  try {
    appendFileSync(workerLogPath(), `${(/* @__PURE__ */ new Date()).toISOString()} ${msg}
`);
  } catch {
  }
}
function takeSingleInstance() {
  try {
    const prev = Number.parseInt(readFileSync2(workerPidPath(), "utf8").trim(), 10);
    if (Number.isInteger(prev) && prev !== process.pid && isAlive(prev)) {
      killWorkerTree(prev);
    }
  } catch {
  }
  writeFileSync2(workerPidPath(), String(process.pid), "utf8");
}
function releaseSingleInstance() {
  try {
    const owner = Number.parseInt(readFileSync2(workerPidPath(), "utf8").trim(), 10);
    if (owner === process.pid) rmSync(workerPidPath(), { force: true });
  } catch {
  }
}
function readPayload() {
  try {
    return parsePayload(readFileSync2(payloadPath(), "utf8"));
  } catch {
    return {};
  }
}
function runSpeak(cliPath, text) {
  return new Promise((resolve) => {
    const args = ["speak", "--text", text, "--daemon"];
    const child = spawn2(cliPath, args, {
      stdio: "ignore",
      windowsHide: true,
      shell: needsShell(cliPath)
    });
    child.on("error", (err) => {
      log(`speak error: ${err.message}`);
      resolve();
    });
    child.on("exit", (code) => {
      if (code !== 0) log(`speak sali\xF3 con c\xF3digo ${code}`);
      resolve();
    });
  });
}
async function main() {
  ensureStateDir();
  takeSingleInstance();
  const cfg = loadConfig();
  if (!cfg.enabled) return;
  const payload = readPayload();
  const text = await buildMessage(payload, cfg);
  if (!text) {
    log("mensaje vac\xEDo tras la construcci\xF3n; nada que narrar");
    return;
  }
  const cli = resolveCli();
  if (!cli) {
    log("tts-sidecar no encontrado en PATH; se omite la narraci\xF3n");
    return;
  }
  await runSpeak(cli, text);
}
main().catch((err) => log(`worker error: ${err?.message ?? err}`)).finally(() => {
  releaseSingleInstance();
  process.exit(0);
});
