# Diseño — Narración determinista por hooks (rediseño de `buildMessage`)

> Estado: **diseño MVP**, sin implementar. Entregable validado con el usuario.
> Alcance: subsistema `src/message/`. No modifica el catálogo de avisos
> estáticos (los reutiliza).

## 1. Contexto y problema

### 1.1 Qué hace el subsistema y qué se espera de él
`tts-sidecar-narrator` narra por voz, en tiempo real, lo que Claude Code acaba de
hacer. En cada hook de fin de turno (`Stop`, `SubagentStop`, `StopFailure`),
`buildMessage` produce una locución en primera persona que resume ese turno. Para
generarla llama a un LLM (Gemini → OpenRouter como fallback) alimentado con dos
fuentes: el `last_assistant_message` del payload y la cola del transcript JSONL de
la sesión (`readTranscriptMessages`). El resultado se sanea para voz y se
sintetiza (`say`); si el LLM falla, degrada a un resumen local determinista y, en
último recurso, a un aviso estático pre-sintetizado (`play`).

**Comportamiento esperado:** la locución debe ser **fiel al turno** — narrar lo
que el asistente realmente hizo, ni más ni menos. Un turno trivial (un saludo,
una respuesta breve) debe narrarse como trivial.

### 1.2 El problema
La locución puede **confabular**: narrar trabajo técnico que nunca ocurrió. La
causa es estructural, no un fallo puntual del modelo: el pipeline entrega al LLM
**contenido sintético del harness** (salida de comandos slash, caveats de
`/compact`, wrappers de comando, resultados de herramientas) mezclado con los
turnos reales, porque `parseRole`/`extractMessage` aceptan cualquier línea del
transcript con `role: "user"` sin distinguir su origen. Sobre ese input
contaminado, un cierre de prompt que **presupone** trabajo técnico y un system
prompt que ordena conservar comandos e identificadores empujan al modelo a
construir un «logro» con el único material concreto que ve: el ruido. El
resultado es una narración falsa que rompe la confianza en el sistema.

Este documento diseña un rediseño **determinista** de `buildMessage` que elimina
esa contaminación en su raíz. La evidencia que fundamenta el diagnóstico y el
diseño es el incidente reproducido a continuación.

### 1.3 Evidencia: el bug reproducido (no hipótesis)
En el primer `Stop` de una sesión el usuario solo dijo «Hola» y el asistente
saludó. La locución narrada fue una **confabulación**:

> «He configurado correctamente el modelo a Sonnet 5 mediante el comando model
> haiku y he actualizado la persistencia de la configuración…»

Reproducido enviando el input real a Gemini (HTTP 200, locución fabricada). **No
hay contaminación entre sesiones**: `payload.json` y `transcript_path` eran los
correctos de la sesión.

### 1.4 Causa raíz confirmada por catálogo empírico
El origen del texto «Sonnet 5» está identificado con precisión estructural. En
el transcript real de la sesión, tres líneas con `type: "user"` transportan
ruido del harness que hoy entra al array `messages` que ve el LLM:

| Contenido (head)                              | `isMeta` | `origin`             | `promptSource` |
|-----------------------------------------------|----------|----------------------|----------------|
| `<local-command-caveat>Caveat: …`             | `true`   | `null`               | `null`         |
| `<command-name>/model</command-name>…`        | `null`   | `null`               | `null`         |
| `<local-command-stdout>Set model to Sonnet 5…`| `null`   | `null`               | `null`         |

La tercera línea es el material concreto que el modelo narró como «logro». Las
tres son sintéticas: **ninguna tiene `origin.kind === "human"`**.

Tres causas raíz, todas atacables de forma determinista:
1. **`parseRole`/`extractMessage` no filtran contenido sintético.** Aceptan
   cualquier línea con `message.role === "user"`, incluidos command wrappers,
   caveats y stdout de comandos.
2. **Cierre presuntivo.** `buildUserContent` anexa «Cuéntame en voz alta … qué
   lograste avanzar», que presupone trabajo técnico; ante un turno trivial el
   modelo inventa un logro con el único material concreto que ve (el ruido).
3. **System prompt reforzador.** `SUMMARY_SYSTEM_PROMPT` ordena «conserva
   comandos, rutas, identificadores», tratando el ruido como contenido a preservar.

### 1.5 Problema secundario (ortogonal)
Ling 3.0 Flash puede agotar `max_tokens: 512` en `thinking` y devolver texto
vacío. Es un problema de robustez del fallback, independiente de la confabulación.
Cerrado empíricamente con key real el 2026-07-31: los desactivadores de
razonamiento no funcionan en `/v1/messages`, así que el fix adoptado es **cambiar
el modelo de OpenRouter a `poolside/laguna-xs-2.1:free`**, que no razona y por
tanto nunca agota el presupuesto en `thinking` (§9).

## 2. Principio rector del MVP

**Determinismo total con un único punto de síntesis LLM.** Decisión de producto
(2026-07-31): en esta primera versión, **solo `Stop` genera locución dinámica**
— un resumen de la última respuesta del asistente, la que consolida la respuesta
al prompt del usuario y cierra el loop agéntico. Todos los demás eventos
reproducen **avisos pre-sintetizados** (`play`), sin síntesis por evento y sin
LLM.

Consecuencia estructural clave: **el LLM recibe únicamente
`payload.last_assistant_message`**. Ni historial ni transcript. El ruido del
harness que causó la confabulación queda **estructuralmente inalcanzable**: no
hay nada que filtrar porque la fuente contaminada ya no participa. Esto lleva la
jerarquía de confianza a su conclusión lógica — la única fuente autoritativa del
turno es el `last_assistant_message` del payload, que la documentación de hooks
recomienda explícitamente sobre el transcript (el archivo se escribe
asíncronamente y puede ir retrasado).

Toda ramificación restante se basa en propiedades **estructurales y
verificables** (evento del payload, vacío/no-vacío tras saneo exacto). Cero
heurísticas, cero puntuación difusa de texto. La densidad de prosa u otra
clasificación semántica queda **descartada**.

## 3. Arquitectura MVP: mapeo evento → comportamiento

| Evento             | Comportamiento                                          | Síntesis |
|--------------------|---------------------------------------------------------|----------|
| `Stop`             | Resumen LLM de `last_assistant_message` (§4-§6)         | `say` (única ruta dinámica) |
| `SubagentStop`     | `play(AVISOS.SubagentStop)` — aviso fijo                | Ninguna  |
| `StopFailure`      | `play(AVISOS.StopFailure)` — aviso genérico de fallo    | Ninguna  |
| `Notification`     | `play(AVISOS.Notification)` — aviso fijo de atención    | Ninguna  |
| `UserPromptSubmit` | `play(AVISOS.UserPromptSubmit)` — acuse fijo, **intacto** | Ninguna |
| Otro / ausente     | Cae a la ruta de `Stop` (default, ver abajo)            | Según umbral |

**Regla default (hace total el mapeo):** cualquier otro valor de
`hook_event_name` — incluido ausente, porque `parsePayload` degrada a `{}` ante
stdin malformado — cae a la ruta de `Stop`, preservando el comportamiento actual
(`build-message.ts:43`). El espacio real de eventos está **cerrado por
construcción** en `hooks/hooks.json`: solo los cinco eventos de la tabla invocan
`narrate-hook` (`SessionStart` ejecuta `health-check.js`, que no pasa por
`buildMessage`). En el caso degenerado, el umbral de §4 degrada a
`staticForEvent` → `AVISOS.Default`.

**Decisiones de producto que fija esta tabla** (resueltas 2026-07-31):
- `Notification` **cambia** respecto del código actual: hoy sintetiza (`say`) el
  mensaje redactado del payload; en el MVP reproduce el aviso fijo. Trade-off
  aceptado: se pierde el detalle de *qué* pide (permiso vs. espera de input) a
  cambio de latencia cero y cero síntesis por evento. El mensaje específico
  sigue visible en pantalla.
- `StopFailure` usa un único aviso genérico. La granularidad por familia de
  error queda como iteración futura (§10), no bloquea el MVP.
- `SubagentStop` no narra el contenido del subagente. Motivo verificado: la
  correlación determinista línea-del-transcript ↔ subagente-que-terminó no es
  hoy verificable (las líneas `isSidechain` de varios subagentes se entrelazan
  en el transcript principal sin campo de correlación catalogado); narrar sin
  atribución reintroduciría el riesgo de confabulación.

## 4. Umbral determinista de invocación (ruta `Stop`)

Señal única: `primary = sanitizeForSpeech(payload.last_assistant_message ?? "")`.

- **Sin evidencia** — `primary` vacío → **no se invoca el LLM.** Degrada directo
  al aviso estático por evento (`play`). Un turno sin texto final no tiene nada
  fiel que narrar.
- **Con evidencia** — `primary` no vacío → se invoca la cadena LLM (§5). No se
  distingue turno sustantivo de trivial: la confabulación se elimina porque el
  ruido ya no existe en el input y el prompt es anti-invención (§6).

**Verificado empíricamente (2026-07-31):** `sanitizeForSpeech` conserva el
contenido de los bloques de código — solo elimina los delimitadores
(`sanitize.ts:15`) —, por lo que un turno cuyo mensaje final es puro código **no**
sanea a vacío y sí invoca el LLM. Solo sanean a vacío los mensajes sin material
narrable: solo símbolos/emojis, solo URLs o solo imágenes markdown. Trade-off
declarado y aceptado: un mensaje final que sea únicamente una URL degrada al
aviso estático.

## 5. Input al LLM: solo el mensaje final, acotado

`GenerationInput` se reduce a `{ text }` (desaparece `messages`; `mode` deja de
ser necesario al existir un único modo `summary`). `buildUserContent` construye
**un único mensaje `user`** que contiene el material y la instrucción de cierre:

```
[ { role: "user",
    content: "Material del turno:\n\n" + clampHead(text) + "\n\n" + CIERRE } ]
```

Sin historial no hay secuencia de roles que normalizar ni filtrar: desaparecen
`readTranscriptMessages`, `extractMessage`, `parseRole`, `extractContent` y
`extractText` de la ruta LLM, junto con el mapeo `[Sistema]:`.

### 5.1 Topes de tamaño deterministas (`clampSentences`)

Decisión (2026-07-31): topes en **ambas rutas**, implementados como funciones
nuevas — **`sanitizeForSpeech` no se modifica** (su contrato heredado «sin
truncamiento» se conserva intacto; el corte es responsabilidad del sitio que lo
necesita).

- **`clampHead(text)` — input al LLM.** Tope generoso (`LLM_INPUT_MAX_CHARS ≈
  16000`, ~4k tokens) que conserva el **inicio** del mensaje, cortando en límite
  de párrafo. Protege el timeout de 8 s y la cuota; en la práctica casi nunca
  dispara. Se conserva la cabeza porque las respuestas finales de Claude Code
  lideran con el resultado (su guía de estilo), así que la sustancia del resumen
  vive al inicio.
- **`clampSentences(text, maxChars)` — degradación local.** Tope corto
  (`LOCAL_SPEECH_MAX_CHARS ≈ 400`, ~30 s de locución a ritmo TTS español).
  Acumula **oraciones completas** (terminadores `.`, `!`, `?`, `…`) hasta que
  añadir la siguiente exceda el tope; si la primera oración ya lo excede, corta
  en el último límite de **palabra** (nunca a mitad de palabra, sin puntos
  suspensivos — no se pronuncian). Orden de aplicación: primero
  `sanitizeForSpeech` (normalizar), después `clampSentences` (así el conteo
  refleja lo que se locuta y los límites de oración se detectan sobre texto
  limpio). Pura y determinista: mismo texto y tope → mismo corte.

**Dónde NO se aplica corte:** salida del LLM (ya acotada por
`MAX_OUTPUT_TOKENS: 512` y el contrato del prompt de 1-2 frases — un tercer
corte sería redundante y podría mutilar la locución), avisos estáticos
(duración fija horneada) y el umbral de §4 (el clamp decide *cuánto* se narra,
nunca *si* se narra).

## 6. Prompt anti-invención (modo único `summary`)

Contrato común (verificado luego por `sanitize.ts`): texto plano, español, 1-2
frases, primera persona, sin markdown ni símbolos. **Regla anti-invención**:
narrar solo lo presente en el material; si el turno fue trivial o
conversacional, decirlo como tal; nunca inventar logros, comandos, archivos ni
identificadores que no estén explícitos.

System prompt (reemplaza a `SUMMARY_SYSTEM_PROMPT`):
> Eres un desarrollador que habla por voz sintetizada en tiempo real. Narra en
> primera persona, en una o dos frases breves en español, **únicamente lo que
> muestra el material de este turno**. Si el turno fue una conversación breve, un
> saludo o una respuesta sin cambios técnicos, nárralo con naturalidad como tal.
> **No inventes** trabajo, comandos, rutas ni identificadores que no aparezcan
> explícitos. Conserva los identificadores y rutas que sí estén presentes cuando
> aporten claridad. Texto plano, sin markdown ni símbolos.

Cierre (reemplaza a «qué lograste avanzar»), **no presuntivo**:
> «Cuéntamelo en voz alta en primera persona, de forma fiel a lo que ocurrió en
> este turno.»

## 7. Flujo integrado único dentro de `buildMessage`

```
buildMessage(payload, cfg):
  event = payload.hook_event_name

  if event === "Notification":     return play(AVISOS.Notification)      // fijo (cambio)
  if event === "UserPromptSubmit": return play(AVISOS.UserPromptSubmit)  // intacto
  if event === "SubagentStop":     return play(AVISOS.SubagentStop)      // fijo (cambio)
  if event === "StopFailure":      return play(AVISOS.StopFailure)       // fijo (cambio)

  // Ruta Stop (y default para evento desconocido/ausente):
  raw     = payload.last_assistant_message ?? ""
  primary = sanitizeForSpeech(raw)                     // §4 umbral

  if primary === "":               return play(staticForEvent(event))    // sin LLM

  if cfg.messageMode === "llm":
    providers = buildProviders(cfg)
    if providers.length > 0:
      out = runChain(providers, { text: clampHead(raw) })                // §5, §6
      if out:
        clean = sanitizeForSpeech(out)
        if clean: return say(clean)

  // Degradación local determinista:
  return say(clampSentences(primary, LOCAL_SPEECH_MAX_CHARS))            // §5.1
```

Cambios respecto del código actual:
- `readTranscriptMessages` y toda la extracción del transcript **desaparecen**
  de esta ruta (quedan documentadas en el Apéndice A para reintroducción futura
  de contexto).
- `GenerationMode` queda con el único valor `summary`; `GenerationInput` pierde
  `messages` (y `mode` si se decide eliminar el enum).
- `buildUserContent` se reduce al mensaje único de §5.
- `Notification`, `SubagentStop` y `StopFailure` pasan de rutas con síntesis a
  `play` directo.
- La degradación local final siempre produce locución: con `primary` no vacío,
  `clampSentences(primary, …)` nunca es vacío, por lo que el `play` de último
  recurso solo es alcanzable vía umbral (se mantiene `staticForEvent` como
  cinturón de seguridad declarado).

## 8. Contrato de datos entre etapas

- **Entrada:** `HookPayload` (`hook_event_name`, `last_assistant_message`).
  `transcript_path` deja de consumirse en el MVP.
- **`GenerationInput`** = `{ text: string }` — texto ya acotado por `clampHead`.
- **`runChain → string | undefined`** — sin cambios de firma.
- **`clampHead(text): string`**, **`clampSentences(text, max): string`** —
  puras, deterministas, en módulo propio (p. ej. `clamp.ts`); `sanitize.ts` no
  se toca.
- **Salida:** `NarrationRequest` (`{say,text}` | `{play,label}`) — sin cambios.

Invariante del MVP: **el LLM nunca recibe contenido que no sea el
`last_assistant_message` del payload.** El transcript — y con él todo el ruido
del harness — es estructuralmente inalcanzable.

## 9. Robustez del fallback (problema secundario, ortogonal)

**Resuelto cambiando el modelo de OpenRouter a uno sin razonamiento
(2026-07-31, decidido por sondeo en vivo con key real contra
`https://openrouter.ai/api/v1/messages`, replicando el body exacto de
`openrouter-provider.ts`).** Comparativa de los dos modelos `:free`:

| Modelo                          | `thinking` por defecto | Vacío a 512 tok | Latencia |
|---------------------------------|------------------------|-----------------|----------|
| `inclusionai/ling-3.0-flash:free` | **Sí, siempre** (~110–480 tok) | **Frecuente** (3/4 con el prompt anti-invención) | 715–1600 ms |
| `poolside/laguna-xs-2.1:free`   | **No, nunca** (`think=0`) | **Nunca** (0/N) | 263–610 ms |

**Decisión: `poolside/laguna-xs-2.1:free`.** Al no emitir razonamiento, no hay
bloque `thinking` que consuma el presupuesto de `max_tokens`, por lo que el fallo
de §1.5 (texto vacío) **desaparece en la raíz** en vez de mitigarse. Es además
2-3× más rápido en la ruta caliente de voz y narró fielmente tanto el turno
trivial «Hola» (como saludo, sin confabular) como inputs pesados. `MAX_OUTPUT_TOKENS:
512` compartido se conserva: ya no hace falta subirlo solo para OpenRouter.

Caveat menor: Laguna produjo alguna vez artefactos cosméticos de espaciado
(«introdujeClamp», «mapé»); raros, `sanitizeForSpeech` mitiga parte y el impacto
es acotado por ser el proveedor de *fallback* (solo entra si Gemini cae).

Descartado sobre Ling (documentado para no reabrir): en el endpoint
Anthropic-compat `/v1/messages`, `reasoning: { effort: "none" }` se **ignora** (el
`thinking` sigue apareciendo; el modelo no es `mandatory`, HTTP 200) y
`reasoning: { enabled: false }` es **contraproducente** (desboca el `thinking`
hasta `stop_reason: max_tokens` → vacío). El único fix viable con Ling habría sido
subir `max_tokens`; el cambio de modelo lo hace innecesario.

**End-to-end verificado:** con input limpio, OpenRouter devolvió una narración
**fiel** en primera persona (sin confabulación), confirmando que la cadena
Gemini→OpenRouter opera correctamente con la key configurada.

## 10. Iteraciones futuras (fuera del MVP, documentadas para no reabrirlas)

- **`StopFailure` por familia de error.** Los hooks entregan el tipo de error de
  forma estructural (`rate_limit`, `overloaded`, `authentication_failed`,
  `billing_error`, `server_error`, `max_output_tokens`, `unknown`…; matchers
  documentados). Mapeo determinista `Record` tipo → aviso horneado («Se alcanzó
  el límite de peticiones», «Error del servidor del modelo», genérico para el
  resto). Aditivo; requiere capturar un payload real de `StopFailure` para
  confirmar el nombre del campo y hornear 3-5 WAV.
- **Contexto de transcript con whitelist estructural.** Si algún día se
  reintroduce historial al LLM, la base verificada está en el Apéndice A
  (catálogo empírico + `classifyLine` + normalización de secuencia de roles).
- **`Notification` específico por familia de mensaje.** Requeriría catalogar
  empíricamente las formas de `payload.message` y hornear avisos por familia.
- **`SubagentStop` dinámico.** Requeriría verificar correlación línea↔subagente
  (¿llevan las líneas del JSONL un `agent_id` correlacionable con el payload?).

## 11. Decisiones cerradas y no-repetir

- **LLM solo en `Stop`; input solo `last_assistant_message`** (decisión de
  producto, 2026-07-31). No pasar historial ni transcript al LLM en el MVP.
- `Notification` → aviso fijo `play` (trade-off de especificidad aceptado).
- `StopFailure` → genérico ahora, familias después.
- Topes `clampHead`/`clampSentences` en ambas rutas; `sanitizeForSpeech`
  **no se modifica**.
- **No** heurística de densidad de prosa ni puntuación difusa: descartadas.
- **No** blacklist de marcadores (`<command-name>`, etc.): frágil. (En el MVP ni
  siquiera hay filtrado: la fuente contaminada no participa.)
- **No** re-diagnosticar como contaminación entre sesiones: descartado con
  evidencia.
- **No** tocar `UserPromptSubmit` (acuse fijo `play`).
- `staticForEvent` se reutiliza como destino de degradación, no se duplica.
- El problema de Ling es secundario y ortogonal (§9).

## 12. Próximos pasos

1. Validación final de este documento MVP con el usuario.
2. Solo tras aprobación: plan de implementación con tests, incluyendo como
   mínimo: reproducción del caso «Hola» → narración fiel (sin confabulación);
   umbral con mensaje vacío/solo-símbolos → aviso estático; `clampSentences`
   (límites de oración, caso oración-gigante, tope exacto); mapeo evento→`play`
   de la tabla §3; degradación LLM-caído → resumen local acotado.

---

## Apéndice A — Base verificada para reintroducir contexto (no usado en el MVP)

Material empírico y diseño de filtrado validados durante la investigación.
**Ninguna pieza de este apéndice participa en la ruta de ejecución del MVP**; se
conserva como fundamento si una iteración futura reintroduce historial al LLM.

### A.1 Catálogo empírico del transcript JSONL

Base: 11 transcripts reales de `~/.claude/projects/…tts-sidecar-narrator*`.

`type` de nivel superior observados: `assistant`, `user`, `system`,
`file-history-snapshot`, `attachment`, `mode`, `last-prompt`, `permission-mode`,
`ai-title`, `queue-operation`. Solo `user` y `assistant` pueden contener un
turno narrable; el resto es infraestructura.

Formas de `type: "user"`:

| Forma                          | Señal estructural                                    | ¿Turno real? |
|--------------------------------|------------------------------------------------------|--------------|
| Prompt humano tecleado         | `origin.kind === "human"`, `content` string          | **Sí**       |
| `tool_result`                  | `content` es array `[tool_result]`, `toolUseResult` presente | No   |
| Caveat (`/compact`, comandos)  | `isMeta === true`                                    | No           |
| Command wrapper / stdout       | `origin === null`, `promptSource === null`           | No           |
| `task-notification` (subagente)| `origin.kind === "task-notification"`, `promptSource === "system"` | No |

Formas de `type: "assistant"`: `message.content` es siempre array de bloques
(`text`, `thinking`, `tool_use`). Solo `text` es narrable.

### A.2 Whitelist estructural (`classifyLine`)

```
classifyLine(obj, mode):
  switch obj.type:
    case "user":
      if obj.isMeta === true:            return null   // caveats
      if obj.origin?.kind !== "human":   return null   // wrappers, stdout, task-notif
      if typeof obj.message.content !== "string": return null  // tool_result
      text = trim(obj.message.content)
      return text ? { role: "user", content: text } : null
    case "assistant":
      if obj.isSidechain === true && mode !== "subagent-summary": return null
      text = join con "\n\n" de bloques content con type === "text"
      return text ? { role: "assistant", content: text } : null
    default:                             return null   // infraestructura
```

Regla positiva única, robusta a marcadores nuevos: un `type: "user"` es turno
real solo si `origin.kind === "human"` y su `content` es string. Trade-offs
declarados: turnos humanos con `content` array (imágenes/attachments) y
transcripts sin campo `origin` quedan fuera — **fallan cerrado** (menos
contexto, nunca ruido).

### A.3 Normalización determinista de la secuencia de roles

El filtrado produce secuencias degeneradas como caso normal: sobre los 11
transcripts, 9 quedan con roles consecutivos iguales y 5 empiezan con
`assistant` en la cola de 10 mensajes. Sondeo en vivo (2026-07-31): Gemini
acepta las cinco formas degeneradas probadas (HTTP 200 con texto); la
documentación de OpenRouter no garantiza esa tolerancia. Normalización
requerida si se reintroduce contexto: (1) fusionar mensajes consecutivos del
mismo rol con `"\n\n"`; (2) el cierre del modo garantiza terminar en `user`;
(3) si la secuencia empieza por `assistant`, anteponer el mensaje constante
`{ role: "user", content: "Este es el material del turno:" }`.
