# Integración con TTS-Sidecar

Este documento describe la integración de `tts-sidecar-narrator` con el motor de síntesis **TTS-Sidecar**, desde la perspectiva del **plugin (el consumidor)**.

La contraparte, escrita desde la perspectiva del motor, está en el repositorio de TTS-Sidecar:
[docs/NARRATION-INTEGRATION.md](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/blob/main/docs/NARRATION-INTEGRATION.md).

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

| Superficie | Uso en el plugin |
|------------|------------------|
| `tts-sidecar speak --text "<msg>" --daemon` | Síntesis y reproducción de cada locución. **Requiere el daemon vivo** y falla si no lo está (no lo arranca solo); por eso el plugin lo mantiene caliente. |
| `tts-sidecar doctor --json` | Verificación del entorno al iniciar sesión. Se parsea `checks[]` buscando `name == "Chatterbox model"` y su `status` (`PASS`/`FAIL`). |
| `tts-sidecar daemon status --json` | Comprueba si el daemon corre (`running == true`) antes de intentar levantarlo. |
| `tts-sidecar daemon start` | Levanta el daemon de forma desanclada para dejar el modelo en memoria. |

## Cómo lo usan los hooks

- **`Stop` / `Notification`** → `narrate-worker` construye el mensaje y llama a
  `speak --text … --daemon`. El worker corre desanclado; nunca bloquea el turno.
- **`SessionStart`** → `health-check` corre `doctor --json`. Si el modelo está en
  caché (`PASS`) y el daemon no corre, lo levanta con `daemon start`
  (fire-and-forget). Si falta el CLI o el modelo, avisa al usuario vía
  `systemMessage` y no hace nada más.

La resolución del ejecutable la hace `lib/resolve-cli.ts`, que escanea el `PATH` (honrando `PATHEXT` en Windows).

## Requisitos sobre el motor

Para que la narración funcione, en la máquina del usuario debe existir:

1. `tts-sidecar` en el `PATH` (instalado por cualquier canal: `uv`, `pipx` o el
   instalador nativo por SO), en la **versión mínima verificada: v0.7.8**. Las
   superficies del contrato son estables desde antes, así que versiones
   anteriores pueden funcionar, pero v0.7.8 es la versión contra la que se
   corrió el smoke test del release del plugin (esta declaración se actualiza
   en cada corte; ver [RELEASING.md](RELEASING.md)).
2. El modelo `es-mx-latam` en caché, descargado con `tts-sidecar setup`.

El comando `/tts-sidecar-narrator:install` del plugin guía ambos pasos.

## Degradación y no intrusión

Si el CLI no está en el `PATH`, el modelo no está en caché, o el daemon no responde, el plugin **degrada en silencio**: no reproduce audio, no bloquea ni retrasa el turno de Claude Code, y (solo en `SessionStart`) emite un aviso informativo. La ausencia del motor nunca es un error para el usuario de Claude Code.

## Estabilidad del contrato

El plugin asume estables los flags y el esquema JSON de las cuatro superficies de arriba. Si una versión de TTS-Sidecar cambia, por ejemplo, el `name` del check del modelo en `doctor --json`, o el campo `running` de `daemon status --json`, la integración se rompe. Esa lista es el contrato que ambos proyectos deben cuidar; su contraparte formal vive en el documento de integración del motor.
