---
name: narrate
description: Controla la narración por voz de TTS-Sidecar (activar/desactivar, modo de generación, estado) y narra texto a demanda. Úsala cuando el usuario pida "léeme esto en voz alta", "activa/desactiva la narración", "cambia el modo de narración", "narra ...", o pregunte por el estado o la configuración de la narración por voz.
---

# Narración por voz con TTS-Sidecar

Esta skill opera el plugin `tts-sidecar-narrator`, que narra por voz la actividad
de la sesión. La **automatización por turno** la manejan los hooks (no esta
skill); aquí se cubre el **uso consciente**: toggles, modo, estado y narración a
demanda. Todas las operaciones pasan por un único script de control:

```
node "${CLAUDE_PLUGIN_ROOT}/dist/narrate-ctl.js" <comando> [args]
```

Ejecuta ese comando con la herramienta de shell. Es multiplataforma (Node ya está
presente por ser el runtime de Claude Code) y no requiere que TTS-Sidecar esté
aprovisionado salvo para `say`.

## Comandos

| Intención del usuario | Comando |
|-----------------------|---------|
| Activar la narración | `narrate-ctl.js on` |
| Desactivar la narración | `narrate-ctl.js off` |
| Ver el estado y la configuración | `narrate-ctl.js status` |
| Usar LLM (mensajes elaborados) | `narrate-ctl.js mode llm` |
| Solo local (sin red, privado) | `narrate-ctl.js mode local` |
| Narrar un texto ahora | `narrate-ctl.js say "texto a narrar"` |

Tras `on`/`off`/`mode`, confirma al usuario el nuevo estado en una frase. Para
`status`, resume la salida (no vuelques rutas si el usuario solo preguntó si está
activa).

## Narración a demanda ("léeme esto")

Cuando el usuario pida narrar algo, **redacta tú un texto breve y natural en
español** (una o dos frases, sin markdown ni símbolos, apto para leerse en voz
alta) y pásalo a `say`. No narres bloques de código, rutas ni markdown crudo:
parafrasea. Requiere que TTS-Sidecar esté instalado y aprovisionado
(`tts-sidecar setup`); si `say` reporta que el CLI no está en el PATH, indícalo.

## Configuración de claves (modo LLM)

El modo `llm` genera los mensajes con niveles gratuitos de LLM: **Gemini** (free
tier, principal) y **OpenRouter** (modelos `:free`, fallback). Las claves son del
usuario. Por privacidad, **no pidas ni manejes las claves en el chat** (quedarían
en el transcript). En su lugar, guía al usuario a proveerlas por una de estas
vías, en orden de preferencia:

1. **Variables de entorno** (tienen precedencia): `GEMINI_API_KEY` y/o
   `OPENROUTER_API_KEY`.
2. **Editar `config.json`** en el state dir (la ruta la da `narrate-ctl.js
   status`), añadiendo `"geminiApiKey"` y/o `"openRouterApiKey"`.

Sin claves configuradas, el modo `llm` degrada de facto a `local`, que funciona
100 % offline con mensajes más simples.

## Privacidad (adviértelo al activar el modo LLM)

El modo `llm` envía contenido de la sesión (el último mensaje del asistente y un
extracto del transcript) a un tercero (Google u OpenRouter). Es un cambio de
postura respecto al motor TTS-Sidecar, que sintetiza 100 % offline. Si el usuario
activa el modo `llm` o configura claves, recuérdaselo en una frase y menciona que
`mode local` evita cualquier envío externo.
