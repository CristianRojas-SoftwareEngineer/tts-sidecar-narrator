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
function buildUserContent(messages) {
  const out = messages.filter((m) => m.content && m.content.trim().length > 0).map(
    (m) => m.role === "system" ? { role: "user", content: `[Sistema]: ${m.content}` } : m
  );
  if (out.length > 0 && out[out.length - 1].role !== "user") {
    out.push({ role: "user", content: "\xBFQu\xE9 pas\xF3 en este turno?" });
  }
  return out;
}

// src/message/prompts.ts
var SUMMARY_SYSTEM_PROMPT = "Eres la voz del asistente de continuidad de Smart Code Proxy. Narra en alto nivel, en una o dos frases cortas en espa\xF1ol, una s\xEDntesis de lo realizado. Parafrasea; no expliques detalle t\xE9cnico punto por punto ni enumeres pasos. Texto plano para ser le\xEDdo en voz alta: sin markdown, sin asteriscos, comillas, guiones ni s\xEDmbolos. Sin puntos al final de las oraciones. Habla en primera persona.";
var PROMPT_SYSTEM_PROMPT = "Eres la voz del asistente Smart Code Proxy. Recibir\xE1s tres mensajes: la petici\xF3n anterior del usuario, tu \xFAltima respuesta, y la nueva petici\xF3n del usuario. Responde SOLO a la nueva petici\xF3n (la tercera) en una sola oraci\xF3n breve y natural en espa\xF1ol, confirmando que proceder\xE1s a investigar o ejecutar lo solicitado. Texto plano para ser le\xEDdo en voz alta: sin markdown, sin asteriscos, comillas, guiones ni s\xEDmbolos. Sin puntos al final.";
function systemPromptFor(mode) {
  switch (mode) {
    case "summary":
      return SUMMARY_SYSTEM_PROMPT;
    case "prompt":
      return PROMPT_SYSTEM_PROMPT;
  }
}

// src/message/gemini-provider.ts
var MODEL = "gemini-3.1-flash-lite";
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
      contents: buildUserContent(input.messages).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      })),
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
var ENDPOINT2 = "https://openrouter.ai/api/v1/messages";
var MODEL2 = "poolside/laguna-xs-2.1:free";
var OpenRouterProvider = class {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  name = "openrouter";
  async generate(input) {
    if (!this.apiKey) throw new Error("OpenRouter: sin API key");
    const messages = buildUserContent(input.messages);
    const body = {
      model: MODEL2,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPromptFor(input.mode),
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
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
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    if (!text) throw new Error("OpenRouter devolvi\xF3 respuesta vac\xEDa");
    return text;
  }
};

// src/message/sanitize.ts
function toPlainText(input) {
  let t = input ?? "";
  t = t.replace(/```([\s\S]*?)```/g, "$1");
  t = t.replace(/~~~([\s\S]*?)~~~/g, "$1");
  t = t.replace(/`([^`]*)`/g, "$1");
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
function sanitizeForSpeech(input) {
  const plain = toPlainText(input);
  return plain ? plain.replace(/\s+/g, " ").trim() : "";
}

// src/message/local-builder.ts
var STATIC_BY_EVENT = {
  Stop: "El asistente termin\xF3 su turno.",
  UserPromptSubmit: "Solicitud recibida. Procesando con Claude.",
  SubagentStop: "El subagente complet\xF3 su trabajo.",
  StopFailure: "Ocurri\xF3 un error durante la ejecuci\xF3n.",
  Notification: "Claude necesita tu atenci\xF3n",
  SessionStart: "Sesi\xF3n iniciada"
};
var STATIC_DEFAULT = "Procesando.";
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
  if (event === "UserPromptSubmit") {
    return buildPromptMessage(payload, cfg);
  }
  const primary = (payload.last_assistant_message ?? "").trim();
  if (cfg.messageMode === "llm") {
    const providers = buildProviders(cfg);
    if (providers.length > 0) {
      const input = {
        mode: "summary",
        text: primary,
        messages: readTranscriptMessages(payload.transcript_path)
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
async function buildPromptMessage(payload, cfg) {
  const transcript = readTranscriptMessages(payload.transcript_path);
  const prevUser = lastOfRole(transcript, "user");
  const lastAssistant = lastOfRole(transcript, "assistant");
  const currentPrompt = (payload.prompt ?? "").trim() || (transcript.length ? transcript[transcript.length - 1].content : "");
  const messages = [];
  if (prevUser) messages.push({ role: "user", content: prevUser });
  if (lastAssistant) messages.push({ role: "assistant", content: lastAssistant });
  messages.push({ role: "user", content: currentPrompt });
  if (cfg.messageMode === "llm") {
    const providers = buildProviders(cfg);
    if (providers.length > 0) {
      const input = {
        mode: "prompt",
        text: currentPrompt,
        messages
      };
      const llm = await runChain(providers, input);
      if (llm) {
        const clean = sanitizeForSpeech(llm);
        if (clean) return clean;
      }
    }
  }
  const localSummary = buildLocalSummary(currentPrompt);
  if (localSummary) return localSummary;
  return staticForEvent("UserPromptSubmit");
}
function lastOfRole(messages, role) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role) return messages[i].content;
  }
  return void 0;
}
function buildProviders(cfg) {
  const providers = [];
  if (cfg.geminiApiKey) providers.push(new GeminiProvider(cfg.geminiApiKey));
  if (cfg.openRouterApiKey) providers.push(new OpenRouterProvider(cfg.openRouterApiKey));
  return providers;
}
function readTranscriptMessages(transcriptPath) {
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
    if (role !== "user" && role !== "assistant" && role !== "system") return null;
    const text = extractText(obj.message?.content);
    if (!text) return null;
    return { role, content: text };
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
