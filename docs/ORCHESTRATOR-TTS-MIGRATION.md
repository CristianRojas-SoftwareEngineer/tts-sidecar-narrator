# Migración de la lógica TTS legacy del Agent Orchestrator a este plugin

Este documento es el **inventario y plan de migración** de la funcionalidad de
narración por voz que hoy vive en el repositorio *EvolutiveX Agent Orchestrator*
(Smart Code Proxy) hacia este plugin **`tts-sidecar-narrator`**.

El objetivo es extraer la lógica de generación de mensajes conversacionales que el
Orchestrator ya probó en producción, para que, cuando se elimine toda la
implementación TTS del Orchestrator (ver `tts-sidecar-legacy-removal-plan.md` en
aquel repo), la narración quede **íntegra y sin regresiones** en este plugin.

## Propósito

Este documento es un **inventario y plan de migración de la narración por voz**
del proyecto *EvolutiveX Agent Orchestrator* (también conocido como Smart Code
Proxy) hacia este plugin, **`tts-sidecar-narrator`**. Está redactado para leerse
de forma autónoma, sin necesidad de conocer la historia de la sesión en la que se
creó.

### Antecedentes

- **`tts-sidecar-narrator`** es un plugin de Claude Code que narra por voz la
  actividad de la sesión. No contiene el motor de síntesis: se apoya en
  [TTS-Sidecar](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar),
  un motor de voz externo al que invoca mediante su CLI (`tts-sidecar speak`).
- **EvolutiveX Agent Orchestrator** (Smart Code Proxy) es un proyecto distinto que
  gestiona la experiencia de usuario, los hooks y los eventos de workflow de
  Claude Code. Históricamente **incorporaba su propia lógica de narración TTS**
  embebida: sus propios proveedores LLM, prompts, extracción de contexto del
  transcript y cableado de eventos.

### Por qué existe este documento

Como parte de la separación de responsabilidades entre ambos proyectos, el
Orchestrator está eliminando **toda** su implementación de TTS (ver
`tts-sidecar-legacy-removal-plan.md` en aquel repo) y delegando la narración por
completo a este plugin. Antes de borrar ese código conviene **rescatar la lógica
de generación de mensajes que el Orchestrator ya probó en producción**, para que la
migración no pierda funcionalidad ni introduzca regresiones.

Concretamente, este documento responde dos preguntas sobre el estado actual del
Orchestrator:

1. ¿Qué eventos hook de Claude Code disparan la narración por voz?
2. ¿Qué prompts de sistema y de usuario asignaba cada LLM (Gemini, OpenRouter) a
   cada generación de mensaje conversacional?

…y a partir de ahí determina **qué debe absorber todavía este plugin** para quedar
como único responsable de la narración.

### Qué se migra y qué no

Solo se migra la **lógica de generación de texto** (prompts, contexto del
transcript, textos de fallback y eventos). La capa de audio —el motor TTS-Sidecar
y su integración vía CLI, daemon y health-check— ya está resuelta en este plugin y
no se toca.

> **Hecho fundacional:** el motor de síntesis de voz es
> [TTS-Sidecar](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar).
> Este plugin es quien integra ese motor con Claude Code vía hooks, de forma
> **independiente y aislada** del Orchestrator. Por tanto, la capa de audio
> (`tts-sidecar speak --daemon`, daemon, health-check, instalación) **ya está
> resuelta en este plugin** y NO se migra. Lo que se migra es exclusivamente la
> **lógica de generación de texto** (prompts, contexto, fallbacks, eventos).

## Tabla de contenido

- [Propósito](#propósito)
- [1. Alcance y límites](#1-alcance-y-límites)
  - [1.1 Qué ya está cubierto por este plugin (no migrar)](#11-qué-ya-está-cubierto-por-este-plugin-no-migrar)
  - [1.2 Qué se migra (lógica probada del Orchestrator)](#12-qué-se-migra-lógica-probada-del-orchestrator)
  - [1.3 Qué NO se migra (infra del Orchestrator, ajena a la voz)](#13-qué-no-se-migra-infra-del-orchestrator-ajena-a-la-voz)
- [2. Hallazgo 1 — Eventos hook que generan TTS en el Orchestrator](#2-hallazgo-1--eventos-hook-que-generan-tts-en-el-orchestrator)
- [3. Hallazgo 2 — Prompts de sistema y de usuario por generación LLM](#3-hallazgo-2--prompts-de-sistema-y-de-usuario-por-generación-llm)
  - [3.1 System prompt — modo `prompt` (evento `UserPromptSubmit`)](#31-system-prompt--modo-prompt-evento-userpromptsubmit)
  - [3.2 System prompt — modo `summary`](#32-system-prompt--modo-summary)
  - [3.3 Construcción del "user prompt" (idéntica en ambos providers)](#33-construcción-del-user-prompt-idéntica-en-ambos-providers)
  - [3.4 Textos de fallback por evento](#34-textos-de-fallback-por-evento)
  - [3.5 Extracción de contexto del transcript](#35-extracción-de-contexto-del-transcript)
  - [3.6 Modelos y endpoints que usaba el Orchestrator (provenientes)](#36-modelos-y-endpoints-que-usaba-el-orchestrator-provenientes)
- [4. Brechas: qué debe absorber este plugin](#4-brechas-qué-debe-absorber-este-plugin)
- [5. Decisiones pendientes](#5-decisiones-pendientes)
  - [5.1 `SubagentStop` / `StopFailure` — ¿narrarlos en este plugin?](#51-subagentstop--stopfailure--narrarlos-en-este-plugin)
  - [5.2 Rutas/archivos en la voz](#52-rutasarchivos-en-la-voz)
  - [5.3 Contexto de `UserPromptSubmit`](#53-contexto-de-userpromptsubmit)
  - [5.4 Modelos y formato de OpenRouter](#54-modelos-y-formato-de-openrouter)
- [6. Plan de migración recomendado (orden)](#6-plan-de-migración-recomendado-orden)
- [7. Referencias (archivos fuente en el Orchestrator)](#7-referencias-archivos-fuente-en-el-orchestrator)
- [8. Referencias (archivos de este plugin a modificar)](#8-referencias-archivos-de-este-plugin-a-modificar)

---

## 1. Alcance y límites

### 1.1 Qué ya está cubierto por este plugin (no migrar)

- Integración con el motor: `narrate-worker.ts` → `tts-sidecar speak --daemon`.
- Resolución del CLI y arranque del daemon: `lib/resolve-cli.ts`, `lib/daemon.ts`.
- Verificación de entorno: `health-check.ts` (`SessionStart`).
- Configuración y control: `lib/config.ts`, `narrate-ctl.ts`, `lib/state-dir.ts`.
- Cadena de providers y saneamiento local: `message/provider-chain.ts`,
  `message/sanitize.ts`, `message/local-builder.ts`.

### 1.2 Qué se migra (lógica probada del Orchestrator)

La lógica de generación de mensajes que hoy implementa el Orchestrator en
`src/3-operations/audit-hook-event.handler.ts` y `src/2-services/tts/*`:

1. **Qué eventos hook disparan voz** (sección 2).
2. **Qué prompts de sistema y de usuario** se asignaban a cada generación LLM
   (sección 3).
3. **Textos de fallback** por evento (sección 3.4).
4. **Extracción de contexto** del transcript (tríada para `UserPromptSubmit`,
   cola para `Stop`/`SubagentStop`/`StopFailure`) (sección 3.3).

### 1.3 Qué NO se migra (infra del Orchestrator, ajena a la voz)

- `WorkflowRepository`, métricas de sesión, cierre de workflows, proyector Kanban.
- `DesktopNotificationAdapter` (toasts de escritorio): el Orchestrator emite toasts
  para muchos eventos que **no** se narran; esos toasts son UX del Orchestrator y
  no competen a este plugin.
- Fuente de claves del Orchestrator (`routing/providers/*/secrets.json`): este
  plugin ya resuelve claves vía env / `config.json` (sección 4.4).

---

## 2. Hallazgo 1 — Eventos hook que generan TTS en el Orchestrator

Fuente: `configs/hooks.json` + `src/3-operations/audit-hook-event.handler.ts`
(métodos `speakAsync`, `announceStop`).

El Orchestrator registra muchos hooks, pero **solo cuatro** disparan síntesis de
voz. El resto solo emiten un toast de escritorio.

| Evento hook            | ¿Voz? | Modo        | Método en el handler            | Contexto usado                                   |
|------------------------|:-----:|-------------|----------------------------------|--------------------------------------------------|
| `UserPromptSubmit`     | Sí    | `prompt`    | `speakAsync(event,'prompt')`     | Tríada curada (ver 3.3)                          |
| `Stop`                 | Sí    | `summary`   | `announceStop` → `speakAsync`    | `extractLastNMessages(transcriptPath, N)`        |
| `SubagentStop`         | Sí    | `summary`   | `speakAsync(event,'summary')`    | `extractLastNMessages(transcriptPath, N)`        |
| `StopFailure`          | Sí    | `summary`   | `speakAsync(event,'summary')`    | `extractLastNMessages(transcriptPath, N)`        |
| `SubagentStart`        | No    | —           | solo toast                       | —                                                |
| `PreToolUse`           | No    | —           | solo toast (AskUserQuestion)     | —                                                |
| `PostToolUse`          | No    | —           | solo toast (TaskUpdate)          | —                                                |
| `PostToolUseFailure`   | No    | —           | solo toast                       | —                                                |
| `SessionStart`         | No    | —           | solo toast                       | —                                                |
| `SessionEnd`           | No    | —           | solo toast                       | —                                                |
| `PermissionRequest`    | No    | —           | solo toast                       | —                                                |
| `TaskCreated`          | No    | —           | solo toast                       | —                                                |
| `TaskCompleted`        | No    | —           | solo toast                       | —                                                |

Donde `N = TTS_CONTEXT_N` (por defecto **3**; env `TTS_CONTEXT_N`).

**Nota de divergencia con este plugin:** el plugin actual ya narra `Stop`,
`UserPromptSubmit` y `Notification` (notice), pero **no** registra `SubagentStop`
ni `StopFailure`. Esos dos eventos son la parte de la funcionalidad legacy que
aún falta absorber (ver sección 4).

---

## 3. Hallazgo 2 — Prompts de sistema y de usuario por generación LLM

Fuente: `src/2-services/tts/gemini-tts-text-provider.ts` y
`src/2-services/tts/openrouter-tts-text-provider.ts`. **Ambos providers usan
textualmente los mismos dos system prompts** (uno por modo); la única diferencia
entre providers es el modelo, el endpoint y el formato del body.

### 3.1 System prompt — modo `prompt` (evento `UserPromptSubmit`)

```text
Eres la voz del asistente Smart Code Proxy. Recibirás tres mensajes: la petición
anterior del usuario, tu última respuesta, y la nueva petición del usuario.
Responde SOLO a la nueva petición (la tercera) en una sola oración breve y natural
en español, confirmando que procederás a investigar o ejecutar lo solicitado.
Texto plano para ser leído en voz alta: sin markdown, sin asteriscos, comillas,
guiones ni símbolos. Sin puntos al final.
```

### 3.2 System prompt — modo `summary` (`Stop`, `SubagentStop`, `StopFailure`)

```text
Eres la voz del asistente de continuidad de Smart Code Proxy. Narra en alto nivel,
en una o dos frases cortas en español, una síntesis de lo realizado. Parafrasea; no
expliques detalle técnico punto por punto ni enumeres pasos. Texto plano para ser
leído en voz alta: sin markdown, sin asteriscos, comillas, guiones ni símbolos. Sin
puntos al final de las oraciones. Habla en primera persona.
```

> **Diferencia crítica con este plugin:** el `SUMMARY_SYSTEM_PROMPT` actual de este
> plugin **prohíbe explícitamente** mencionar "nombres de archivos, rutas o
> comandos", mientras que el del Orchestrator **no** lo prohíbe. El commit
> `c73ed75` de este plugin ("conservar rutas/archivos en la voz") ya buscaba
> preservar rutas en la voz; por coherencia, el prompt de resumen de este plugin
> debe alinearse con el del Orchestrator y dejar de suprimir rutas (ver 5.2).

### 3.3 Construcción del "user prompt" (idéntica en ambos providers)

El array de `SessionMessage[]` (extraído del transcript, ver 3.5) se mapea así:

- rol `assistant` → `model` (Gemini) / `assistant` (OpenRouter)
- rol `user` → `user`
- rol `system` → mismo rol, pero con prefijo `[Sistema]: ` delante del texto
- Si el **último** mensaje no es de rol `user`, se anexa uno final:
  `¿Qué pasó en este turno?`

Gemini envía eso en `contents` + `systemInstruction.parts[0].text`; OpenRouter en
`messages` + campo `system`. En ningún caso se colapsa todo en un único string: se
conserva la estructura de roles.

### 3.4 Textos de fallback por evento

Fuente: `composeFallbackText()` en `audit-hook-event.handler.ts`. Se usan cuando
no hay provider o la cadena LLM falla entera.

| Evento            | Texto de fallback (Orchestrator)                  |
|-------------------|---------------------------------------------------|
| `UserPromptSubmit`| `Solicitud recibida. Procesando con Claude.`      |
| `Stop`            | `El asistente terminó su turno.`                  |
| `SubagentStop`    | `El subagente completó su trabajo.`               |
| `StopFailure`     | `Ocurrió un error durante la ejecución.`          |
| (default)         | `Procesando.`                                     |

> El plugin ya tiene `Stop` y `UserPromptSubmit` (con wording casi idéntico:
> `Petición recibida…` vs `Solicitud recibida…`). **Le faltan** `SubagentStop` y
> `StopFailure` (ver 4).

### 3.5 Extracción de contexto del transcript

Fuente: `src/2-services/tts/transcript-extractor.service.ts` +
`src/1-domain/ports/IContextExtractor.ts`.

- **Modo `summary`**: `extractLastNMessages(transcriptPath, N)` lee el JSONL
  completo, filtra roles `user`/`assistant`/`system`, y devuelve los últimos `N`
  mensajes (`{role, text}`).
- **Modo `prompt`**: `extractUserPromptSubmitContext(transcriptPath, currentPrompt)`
  arma la **tríada curada**:
  - `previousUserMessage` = último mensaje `user` del transcript (turno previo)
  - `lastAssistantResponse` = última respuesta `assistant` del transcript
  - `currentPrompt` = el prompt del payload del hook (fiable, viene en el evento)

> **Diferencia con este plugin:** `buildPromptMessage()` de este plugin toma
> `transcript[última línea]` tras quitarle el prefijo `usuario: ` como "prompt
> actual", y envía el transcript tail completo como contexto. **No** construye la
> tríada `(prevUser, lastAssistant, currentPrompt)` ni usa `event.prompt` del
> payload. Migrar la lógica probada implica adoptar la tríada (ver 5.3).

### 3.6 Modelos y endpoints que usaba el Orchestrator (provenientes)

| Provider  | Modelo                          | Endpoint                                  | Formato body        | Auth / params                              |
|-----------|---------------------------------|-------------------------------------------|---------------------|--------------------------------------------|
| Gemini    | `gemini-3.1-flash-lite`         | `…/models/gemini-3.1-flash-lite:generateContent` | `contents`+`systemInstruction` | `?key=` en URL; `maxOutputTokens:512`, `thinkingConfig.thinkingBudget:0` |
| OpenRouter| `poolside/laguna-xs-2.1:free`   | `https://openrouter.ai/api/v1/messages`   | Anthropic Messages (`system` + `messages`) | `Bearer`; `max_tokens:512` |

Cadena de fallback: **Gemini → OpenRouter → texto estático** (ver `TtsTextProviderChain`
y `composition-root.ts`).

> **Diferencia con este plugin:** el plugin usa `gemini-2.0-flash` (header
> `x-goog-api-key`) y `meta-llama/llama-3.3-70b-instruct:free` vía
> `/api/v1/chat/completions` (formato OpenAI, `system` como rol de mensaje). Los
> modelos y el formato del body de OpenRouter **no coinciden** con los del
> Orchestrator. Decisión pendiente en 5.4.

---

## 4. Brechas: qué debe absorber este plugin

Resumen de lo que falta para que la funcionalidad legacy quede íntegra tras
eliminar el TTS del Orchestrator.

| # | Aspecto                                 | Orchestrator (probado)                          | Plugin (actual)                                 | Acción                                                  |
|---|-----------------------------------------|-------------------------------------------------|-------------------------------------------------|---------------------------------------------------------|
| 1 | Evento `SubagentStop`                   | voz `summary` + toast                           | no registrado / no narrado                       | añadir hook + rama `summary` en `build-message.ts`      |
| 2 | Evento `StopFailure`                    | voz `summary` + toast                           | no registrado / no narrado                       | añadir hook + rama `summary` en `build-message.ts`      |
| 3 | System prompt `summary`                 | sin prohibir rutas; 1ª persona                  | prohíbe "archivos, rutas, comandos"              | alinear con el del Orchestrator (conservar rutas)       |
| 4 | System prompt `prompt`                  | tríada explícita ("tres mensajes…")             | genérico ("contexto breve…")                     | adoptar el prompt probado del Orchestrator              |
| 5 | Contexto `UserPromptSubmit`             | tríada `(prevUser,lastAssistant,currentPrompt)` | solo última línea del transcript                 | implementar `extractUserPromptSubmitContext` + usar `event.prompt` |
| 6 | User prompt (roles)                     | mapeo por rol + `[Sistema]:` + `¿Qué pasó…?`    | todo colapsado en un string                      | conservar estructura de roles en `buildUserContent`     |
| 7 | Fallback `SubagentStop`                 | `El subagente completó su trabajo.`             | ausente                                          | añadir a `local-builder.ts` (`STATIC_BY_EVENT`)         |
| 8 | Fallback `StopFailure`                  | `Ocurrió un error durante la ejecución.`        | ausente                                          | añadir a `local-builder.ts` (`STATIC_BY_EVENT`)         |
| 9 | Modelo Gemini                           | `gemini-3.1-flash-lite`                         | `gemini-2.0-flash`                               | decidir (5.4)                                            |
|10 | Modelo/endpoint OpenRouter             | `poolside/laguna-xs-2.1:free` vía `/api/v1/messages` | `llama-3.3-70b-instruct:free` vía `/api/v1/chat/completions` | decidir (5.4)                            |

Lo que el plugin **ya tiene** y no requiere cambio: `Notification` (notice),
`SessionStart` (health-check), saneamiento que preserva rutas en backticks
(`sanitize.ts`), cadena de fallback local, configuración por env/`config.json`,
e integración con el motor vía CLI.

---

## 5. Decisiones pendientes

### 5.1 `SubagentStop` / `StopFailure` — ¿narrarlos en este plugin?
El Orchestrator los narra. Para "funcionalidad legacy íntegra" deben añadirse a
`hooks/hooks.json` y a `build-message.ts` (modo `summary`). Requiere que el payload
de esos hooks traiga `transcript_path` (lo trae en el Orchestrator).

### 5.2 Rutas/archivos en la voz
El Orchestrator (y el commit `c73ed75` de este plugin) preservan rutas; el
`SUMMARY_SYSTEM_PROMPT` actual de este plugin las prohíbe. **Recomendado:** quitar
la prohibición en el prompt de resumen para alinearse con la intención de
conservar rutas, apoyándose en que `sanitize.ts` ya pronuncia el contenido de
backticks.

### 5.3 Contexto de `UserPromptSubmit`
Recomendado adoptar la tríada curada del Orchestrator: usar `event.prompt` del
payload como `currentPrompt`, y enriquecer con `prevUser`/`lastAssistant` del
transcript (como ya hace `readTranscriptTail`, pero conservando los tres como
mensajes con rol en vez de colapsarlos).

### 5.4 Modelos y formato de OpenRouter
El Orchestrator probó `poolside/laguna-xs-2.1:free` vía la API de Messages de
Anthropic (`/api/v1/messages`). Este plugin usa `llama-3.3-70b-instruct:free` vía
chat/completions. Opciones:
- (a) **Migrar tal cual** los modelos/endpoints del Orchestrator (máxima fidelidad
  a lo probado), o
- (b) **Mantener** los del plugin si se validan como equivalentes, documentando
  que la lógica de prompts/contexto es lo que realmente se migra.

La decisión afecta solo a `message/gemini-provider.ts` y
`message/openrouter-provider.ts`; el resto de la migración es independiente.

---

## 6. Plan de migración recomendado (orden)

1. **Prompts (3.1–3.2):** reemplazar `SUMMARY_SYSTEM_PROMPT` y `PROMPT_SYSTEM_PROMPT`
   en `src/message/prompts.ts` por los del Orchestrator; quitar la prohibición de
   rutas en el de resumen (5.2).
2. **Contexto `UserPromptSubmit` (3.5, 5.3):** en `build-message.ts`, construir la
   tríada `(prevUser, lastAssistant, currentPrompt)` usando `event.prompt` y el
   transcript; pasarla a los providers conservando roles.
3. **User prompt por rol (3.3, 6):** ajustar `buildUserContent` en
   `provider-chain.ts` para mapear roles, prefijar `[Sistema]:` y anexar
   `¿Qué pasó en este turno?` si el último no es `user`.
4. **Fallbacks (3.4):** añadir `SubagentStop` y `StopFailure` a `STATIC_BY_EVENT` en
   `local-builder.ts` (y alinear wording de `UserPromptSubmit`/`Stop` si se desea).
5. **Eventos (2, 4):** registrar `SubagentStop` y `StopFailure` en `hooks/hooks.json`
   y añadir sus ramas (modo `summary`) en `build-message.ts`.
6. **Modelos/endpoints (3.6, 5.4):** aplicar la decisión de la sección 5.4 en
   `gemini-provider.ts` / `openrouter-provider.ts`.
7. **Verificar:** `npm run typecheck`, `npm run build`, `npm run check-dist`,
   `npm test`; añadir tests para la tríada y los dos nuevos eventos.

---

## 7. Referencias (archivos fuente en el Orchestrator)

- `configs/hooks.json` — cableado de hooks.
- `src/3-operations/audit-hook-event.handler.ts` — disparo de voz por evento, fallback.
- `src/2-services/tts/gemini-tts-text-provider.ts` — prompts + llamada Gemini.
- `src/2-services/tts/openrouter-tts-text-provider.ts` — prompts + llamada OpenRouter.
- `src/2-services/tts/tts-text-provider-chain.ts` — cadena Gemini→OpenRouter.
- `src/2-services/tts/transcript-extractor.service.ts` — extracción de contexto.
- `src/1-domain/ports/{ITtsTextProvider,ITTSService,IContextExtractor}.ts` — puertos.
- `src/1-domain/services/tts/normalize-speech-text.ts` — saneamiento (contraparte de `sanitize.ts`).
- `src/4-api/config/env.config.ts`, `src/1-domain/types/config.types.ts` — `TTS_ENABLED`, `TTS_CONTEXT_N`.
- `src/4-api/composition-root.ts` — orden de la cadena y fuente de claves.
- `openspec/changes/archive/2026-06-09--c00050-tts-hooks/specs/tts-hooks.md` — spec de comportamiento.

## 8. Referencias (archivos de este plugin a modificar)

- `src/message/prompts.ts` — system prompts por modo.
- `src/message/build-message.ts` — routing por evento y construcción de contexto.
- `src/message/provider-chain.ts` — `buildUserContent` (mapeo de roles).
- `src/message/local-builder.ts` — `STATIC_BY_EVENT` (fallbacks).
- `src/message/{gemini,openrouter}-provider.ts` — modelos/endpoints (decisión 5.4).
- `hooks/hooks.json` — registro de `SubagentStop` / `StopFailure`.
- `src/message/sanitize.ts` — ya preserva rutas (sin cambio, salvo alinear con 5.2).
