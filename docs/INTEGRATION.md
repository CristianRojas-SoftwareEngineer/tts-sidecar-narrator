# Integración con TTS-Sidecar

Este documento describe la integración de `tts-sidecar-narrator` con el motor de síntesis **TTS-Sidecar**, desde la perspectiva del **plugin (el consumidor)**.

La contraparte, escrita desde la perspectiva del motor, está en el repositorio de TTS-Sidecar:
[docs/CLAUDE-CODE-INTEGRATION.md](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/blob/main/docs/CLAUDE-CODE-INTEGRATION.md).

## Tabla de contenidos

- [Rol en el sistema de narración](#rol-en-el-sistema-de-narración)
- [Contrato: solo la CLI pública](#contrato-solo-la-cli-pública)
- [Superficies del CLI que consume](#superficies-del-cli-que-consume)
- [Cómo lo usan los hooks](#cómo-lo-usan-los-hooks)
- [Requisitos sobre el motor](#requisitos-sobre-el-motor)
- [Degradación y no intrusión](#degradación-y-no-intrusión)
- [Estabilidad del contrato](#estabilidad-del-contrato)

## Rol en el sistema de narración

El sistema de narración por voz tiene dos componentes con repositorios y ciclos de vida independientes:

| Componente | Repositorio | Rol |
|------------|-------------|-----|
| **tts-sidecar-narrator** (este) | `tts-sidecar-narrator` | **Cliente**: detecta eventos de la sesión de Claude Code, construye un mensaje corto y pide su síntesis. |
| **TTS-Sidecar** | [`TTS-Sidecar`](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar) | **Motor**: sintetiza voz 100 % offline y expone una CLI pública. |

El plugin **depende** de TTS-Sidecar; TTS-Sidecar **no** conoce ni depende del plugin. La relación es unidireccional.

## Contrato: solo la CLI pública

El único punto de acoplamiento es el ejecutable `tts-sidecar` en el `PATH` y su interfaz de línea de comandos. El plugin **no** importa el paquete Python `tts_sidecar`, no comparte código ni necesita el árbol fuente del motor — es un consumidor externo idéntico a cualquier script de usuario. Esto mantiene ambos proyectos desacoplados: mientras la CLI sea estable, cada uno evoluciona a su ritmo.

## Superficies del CLI que consume

| # | Superficie | Uso en el plugin |
|---|------------|------------------|
| 1 | `tts-sidecar speech say --text "<msg>" --daemon` | Síntesis y reproducción de cada locución dinámica. **Requiere el daemon vivo** (exit `5` si está caído; no lo arranca solo); por eso el plugin lo mantiene caliente. |
| 2 | `tts-sidecar doctor --json` | Verificación del entorno al iniciar sesión. Se parsea `checks[]` buscando `name == "Chatterbox model"` y su `status` (`PASS`/`FAIL`). Con FAIL emite **un solo objeto** JSON (salida por veredicto, exit `1` sin clave `error`; contrato §10 del motor, desde v0.9.1). |
| 3 | `tts-sidecar daemon status --json` | Comprueba si el daemon corre (`running == true`) antes de intentar levantarlo. |
| 4 | `tts-sidecar daemon start` | Levanta el daemon de forma desanclada para dejar el modelo en memoria. |
| 5 | `tts-sidecar speech synthesize --text "<aviso>" --label <label> --daemon` | Pre-síntesis única de los avisos estáticos (`narrate-ctl presynth`, invocado por la instalación guiada). El label es hash del texto; exit `6` (label ya existe) se trata como «ya pre-sintetizado» (idempotencia). Exit `5` daemon caído, `4` modelo ausente. |
| 6 | `tts-sidecar speech play --label <label>` | Reproducción instantánea de un aviso pre-sintetizado (acuse de `UserPromptSubmit` y fallbacks estáticos), **sin modelo ni daemon**. Exit `3` = cache miss (aviso no pre-sintetizado): se registra en `worker.log` y el turno queda sin audio, sin re-sintetizado ni fallback. Exit `2` = label ilegal. |

## Cómo lo usan los hooks

- **`UserPromptSubmit`** → `narrate-worker` reproduce el acuse fijo pre-sintetizado
  («Procesando con Claude») con `speech play --label …`: sin LLM, sin resumen y
  sin daemon en la ruta caliente.
- **`Stop`** → única ruta de locución dinámica. `narrate-worker` resume el
  `last_assistant_message` del payload (y **solo** ese campo: ni transcript ni
  historial) vía LLM y llama a `speech say --text … --daemon`. Si el mensaje
  final no tiene material narrable, o el LLM cae, degrada al resumen local
  acotado o al aviso estático pre-sintetizado (`speech play`). El worker corre
  desanclado; nunca bloquea el turno.
- **`SubagentStop` / `StopFailure` / `Notification`** → reproducen su anuncio
  pre-sintetizado con `speech play --label …`: sin LLM ni síntesis por evento. Para
  `Notification` el mensaje específico sigue visible en pantalla.
- **`SessionStart`** → `health-check` corre `doctor --json`. Si el modelo está en
  caché (`PASS`) y el daemon no corre, lo levanta con `daemon start`
  (fire-and-forget). Si falta el CLI o el modelo, avisa al usuario vía
  `systemMessage` y no hace nada más.
- **Instalación** (`/tts-sidecar-narrator:install`) → `narrate-ctl presynth`
  pre-sintetiza los anuncios del catálogo (`src/message/static-announcements.ts`) con
  `speech synthesize … --daemon`, una sola vez y de forma idempotente.

La resolución del ejecutable la hace `lib/resolve-cli.ts`, que escanea el `PATH` (honrando `PATHEXT` en Windows).

## Requisitos sobre el motor

Para que la narración funcione, en la máquina del usuario debe existir:

1. `tts-sidecar` en el `PATH` (instalado por cualquier canal: `uv`, `pipx` o el
instalador nativo por SO), en la **versión mínima verificada: v0.9.1**. El
    rediseño de CLI de v0.9.x eliminó el comando `speak` y añadió el grupo
    `speech` (superficies 1, 5 y 6), así que **versiones anteriores a v0.9.1 no
    funcionan** con este plugin (esta declaración se actualiza en cada corte;
    ver [RELEASING.md](RELEASING.md)).
2. El modelo `es-mx-latam` en caché, descargado con `tts-sidecar setup`.

El comando `/tts-sidecar-narrator:install` del plugin guía ambos pasos.

## Degradación y no intrusión

Si el CLI no está en el `PATH`, el modelo no está en caché, o el daemon no responde, el plugin **degrada en silencio**: no reproduce audio, no bloquea ni retrasa el turno de Claude Code, y (solo en `SessionStart`) emite un aviso informativo. La ausencia del motor nunca es un error para el usuario de Claude Code.

## Estabilidad del contrato

El plugin asume estables los flags y el esquema JSON de las seis superficies de arriba. El contrato del motor (`CLI-CONTRACT.md` §12) declara formalmente las superficies 1–4; las superficies 5 y 6 (`speech synthesize` / `speech play`) las adopta este plugin bajo el compromiso de estabilidad publicado del grupo `speech` en v0.9.x, y se declaran solo de este lado. Si una versión de TTS-Sidecar cambia, por ejemplo, el `name` del check del modelo en `doctor --json`, o el campo `running` de `daemon status --json`, la integración se rompe. Esa lista es el contrato que ambos proyectos deben cuidar; su contraparte formal vive en el documento de integración del motor.
