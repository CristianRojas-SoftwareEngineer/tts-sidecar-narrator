# Integración con AI-Voice-InterConnector

Este documento describe la integración de `tts-sidecar-narrator` con el motor de síntesis **AI-Voice-InterConnector**, desde la perspectiva del **plugin (el consumidor)**.

La contraparte, escrita desde la perspectiva del motor, está en el repositorio de AI-Voice-InterConnector:
[docs/CLAUDE-CODE-INTEGRATION.md](https://github.com/CristianRojas-SoftwareEngineer/AI-Voice-InterConnector/blob/main/docs/CLAUDE-CODE-INTEGRATION.md).

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

| Componente                      | Repositorio                                                                                            | Rol                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **tts-sidecar-narrator** (este) | `tts-sidecar-narrator`                                                                                 | **Cliente**: detecta eventos de la sesión de Claude Code, construye un mensaje corto y pide su síntesis. |
| **AI-Voice-InterConnector**     | [`AI-Voice-InterConnector`](https://github.com/CristianRojas-SoftwareEngineer/AI-Voice-InterConnector) | **Motor**: sintetiza voz 100 % offline y expone una CLI pública.                                         |

El plugin **depende** de AI-Voice-InterConnector; AI-Voice-InterConnector **no** conoce ni depende del plugin. La relación es unidireccional.

## Contrato: solo la CLI pública

El único punto de acoplamiento es el ejecutable `ai-voice-interconnector` en el `PATH` y su interfaz de línea de comandos. El plugin **no** enlaza ni importa nada del motor, no comparte código ni necesita su árbol fuente — es un consumidor externo idéntico a cualquier script de usuario. Esto mantiene ambos proyectos desacoplados: mientras la CLI sea estable, cada uno evoluciona a su ritmo.

## Superficies del CLI que consume

| #   | Superficie                                                                            | Uso en el plugin                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ai-voice-interconnector speech say --text "<msg>" --daemon`                          | Síntesis y reproducción de cada locución dinámica. **Requiere el daemon vivo** (exit `5` si está caído; no lo arranca solo); por eso el plugin lo mantiene caliente.                                                                                                                                                                                                                           |
| 2   | `ai-voice-interconnector doctor --json`                                               | Verificación del entorno al iniciar sesión. Se parsea el objeto plano `{ status, issues[], data_dir, hf_cache, base_status }`: `status` es `ok` o `failed`, y `issues` lista los problemas como cadenas. En caso de fallo el `stdout` trae **dos objetos** JSON concatenados (el reporte y luego un `{error,…}`); solo se toma el **primero** (contrato `docs/CLI/CONTRACT.md §12` del motor). |
| 3   | `ai-voice-interconnector daemon status --json`                                        | Comprueba si el daemon corre (`running == true`) antes de intentar levantarlo.                                                                                                                                                                                                                                                                                                                 |
| 4   | `ai-voice-interconnector daemon start`                                                | Levanta el daemon de forma desanclada para dejar el modelo en memoria.                                                                                                                                                                                                                                                                                                                         |
| 5   | `ai-voice-interconnector speech synthesize --text "<aviso>" --label <label> --daemon` | Pre-síntesis única de los avisos estáticos (`narrate-ctl presynth`, invocado por la instalación guiada). El label es un slug semántico fijo; exit `6` (label ya existe) se trata como «ya pre-sintetizado» (idempotencia). `narrate-ctl presynth --force` añade `--force` para sobrescribir el WAV existente (re-sync tras cambiar una frase). Exit `5` daemon caído, `4` modelo ausente.      |
| 6   | `ai-voice-interconnector speech play --label <label>`                                 | Reproducción instantánea de un aviso pre-sintetizado (acuse de `UserPromptSubmit` y fallbacks estáticos), **sin modelo ni daemon**. Exit `3` = cache miss (aviso no pre-sintetizado): se registra en `worker.log` y el turno queda sin audio, sin re-sintetizado ni fallback. Exit `2` = label ilegal.                                                                                         |

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
- **`SessionStart`** → `health-check` corre `doctor --json`. Si el entorno está
  provisionado (`status == "ok"`) y el daemon no corre, lo levanta con `daemon start`
  (fire-and-forget). Si falta el CLI o el entorno falla (`status == "failed"`), avisa
  al usuario vía `systemMessage` y no hace nada más.
- **Instalación** (`/tts-sidecar-narrator:install`) → `narrate-ctl presynth`
  pre-sintetiza los anuncios del catálogo (`src/message/static-announcements.ts`) con
  `speech synthesize … --daemon`, una sola vez y de forma idempotente.

La resolución del ejecutable la hace `lib/resolve-cli.ts`, que escanea el `PATH` (honrando `PATHEXT` en Windows).

## Requisitos sobre el motor

Para que la narración funcione, en la máquina del usuario debe existir:

1. `ai-voice-interconnector` en el `PATH`, instalado con el instalador nativo por SO
   (`install-linux.sh`, `install-macos.sh`, `install-windows.ps1`). El motor expone
   el grupo `speech` (superficies 1, 5 y 6) que el plugin consume.
2. El modelo `qwen3-tts-0.6b` en caché, descargado con `ai-voice-interconnector setup`
   (los instaladores nativos lo encadenan). La narración usa la voz de fábrica
   `default` y no pasa `--voice`.

El comando `/tts-sidecar-narrator:install` del plugin guía ambos pasos.

## Degradación y no intrusión

Si el CLI no está en el `PATH`, el modelo no está en caché, o el daemon no responde, el plugin **degrada en silencio**: no reproduce audio, no bloquea ni retrasa el turno de Claude Code, y (solo en `SessionStart`) emite un aviso informativo. La ausencia del motor nunca es un error para el usuario de Claude Code.

## Estabilidad del contrato

El plugin asume estables los flags y el esquema JSON de las seis superficies de arriba. El contrato del motor (`docs/CLI/CONTRACT.md §12`) declara formalmente las superficies 1–4; las superficies 5 y 6 (`speech synthesize` / `speech play`) las adopta este plugin bajo el compromiso de estabilidad publicado del grupo `speech`, y se declaran solo de este lado. Si una versión de AI-Voice-InterConnector cambia, por ejemplo, el campo `status` de `doctor --json`, o el campo `running` de `daemon status --json`, la integración se rompe. Esa lista es el contrato que ambos proyectos deben cuidar; su contraparte formal vive en el documento de integración del motor.
