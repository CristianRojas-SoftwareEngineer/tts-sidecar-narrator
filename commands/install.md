---
description: Instala y configura TTS-Sidecar (binario + modelo + daemon) y activa la narración por voz de este plugin. Procedimiento guiado, multiplataforma e idempotente.
argument-hint: "(sin argumentos)"
---

# Instalación guiada de TTS-Sidecar para la narración por voz

Eres el asistente que guía al usuario para dejar operativo el plugin `tts-sidecar-narrator`: instalar el motor **TTS-Sidecar**, descargar su modelo, dejar el daemon listo y activar la narración. Ejecuta este procedimiento paso a paso con la herramienta de shell, **informando antes de cada acción** y pidiendo confirmación antes de descargar o instalar algo.

## Reglas de conducta (obligatorias)

- **Detecta el sistema operativo primero** y usa los comandos correctos (bash en
  Linux/macOS, PowerShell en Windows). No asumas el SO.
- **Idempotente**: cada paso debe comprobar si ya está satisfecho y saltarlo si es
  así. Es seguro re-ejecutar el comando completo.
- **Nunca** ejecutes acciones destructivas ni uses `sudo`. TTS-Sidecar se instala
  a nivel de usuario.
- **No manejes claves de API en el chat** (quedarían en el transcript). Para las
  claves, guía al usuario a definir variables de entorno o editar `config.json`.
- Si un paso requiere una acción manual del usuario (instalador gráfico, aceptar
  la licencia del modelo en HuggingFace, reiniciar la terminal para el PATH),
  **detente y explica** con claridad qué debe hacer antes de continuar.
- Al final, **verifica** que todo funciona con una narración de prueba real.

---

## Paso 0 — Diagnóstico del estado actual

1. Comprueba si el CLI ya está en el PATH:
   - Linux/macOS: `command -v tts-sidecar`
   - Windows: `where tts-sidecar` (o `Get-Command tts-sidecar`)
2. Si **está presente**, corre `tts-sidecar doctor --json` y analiza el JSON
   (`checks[].status`, `failed`). Con esto sabes qué falta realmente:
   - Si no hay `FAIL` → el motor ya está listo; salta al **Paso 3** (daemon) y
     luego al **Paso 4** (pre-síntesis) y al **Paso 6** (verificación).
   - Si el check `Chatterbox model` es `FAIL` → falta el modelo; salta al **Paso 2**.
3. Si **no está presente**, continúa al **Paso 1**.

Resume al usuario en una frase qué encontraste y qué vas a hacer.

## Paso 1 — Instalar el binario TTS-Sidecar (detección de canal)

Elige el canal automáticamente, en este orden:

1. **¿Está `uv`?** (`command -v uv` / `where uv`). Si sí:

   ```bash
   uv tool install "tts-sidecar>=0.9.1"
   ```

   (si ya estaba instalado, `uv tool upgrade tts-sidecar`). Es el camino más
   simple y multiplataforma; `uv` provee su propio runtime, el usuario no
   necesita Python.

2. **¿Está `pipx`?** (`command -v pipx`). Si sí:

   ```bash
   pipx install "tts-sidecar>=0.9.1"
   ```

3. **Si no hay ninguno**, ofrece al usuario elegir entre dos opciones y espera su
   decisión:

   **Opción A — Instalar `uv` (recomendada, totalmente automatizable).** `uv` es
   un binario independiente, no requiere Python previo. Instálalo con el
   instalador oficial y luego `uv tool install tts-sidecar`:
   - Linux/macOS: `curl -LsSf https://astral.sh/uv/install.sh | sh`
   - Windows (PowerShell): `powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"`

     Tras instalar `uv`, puede hacer falta reiniciar la terminal o recargar el
     PATH antes de que `uv` esté disponible; adviértelo.

   **Opción B — Instalador nativo por SO** (mejor si el usuario prefiere no tener
   ningún runtime tipo Python/uv). Descarga desde las releases de TTS-Sidecar
   (`https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/releases`) y
   lanza el instalador que corresponda al SO:
   - **Windows**: descargar el instalador Inno Setup (`.exe`) de las releases
     y ejecutarlo. Agrega el binario al PATH y ofrece una casilla para correr
     `setup`. Es interactivo: guía al usuario a completar el asistente.
   - **macOS**: montar el `.dmg` de las releases y correr el script de
     instalación (symlink en `~/.local/bin`, sin `sudo`), o el one-liner
     `install-macos.sh` si el proyecto lo publica.
   - **Linux**: correr `install-linux.sh` (instala el AppImage e integra el PATH)
     o descargar el AppImage y hacerlo ejecutable.

Tras instalar por cualquier vía, **verifica**: `tts-sidecar version`. Si el comando no se encuentra, probablemente el PATH aún no se recargó: indica al usuario abrir una terminal nueva (o reiniciar Claude Code) y reanuda.

## Paso 2 — Descargar el modelo de voz

```bash
tts-sidecar setup
```

Corre los chequeos de `doctor` y descarga el modelo `es-mx-latam` a la caché de HuggingFace **solo si falta** (idempotente). Advertencias a comunicar:

- La descarga es **grande** (varios cientos de MB) y puede tardar.
- El modelo puede estar **gated** en HuggingFace: si `setup` reporta un problema
  de autorización, guía al usuario a aceptar las condiciones del modelo en su
  cuenta de HuggingFace (o definir `HF_TOKEN`) y reintentar.

## Paso 3 — Dejar el daemon en marcha

El plugin narra con `speech say --daemon`, que **usa el daemon y falla si no está levantado** (no lo arranca solo). El daemon mantiene el modelo en memoria, así cada narración tarda segundos en vez de decenas.

```bash
tts-sidecar daemon start
tts-sidecar daemon status
```

Explica que el daemon queda vivo en segundo plano y sobrevive al cierre de Claude Code (no a un reinicio del equipo). Tras un reinicio no hace falta acción manual: el hook `SessionStart` del plugin lo vuelve a levantar solo en la primera sesión nueva (siempre que la narración esté activada y el modelo en caché). Este arranque durante la instalación es solo para dejarlo caliente ya mismo.

## Paso 4 — Pre-sintetizar los anuncios

Con el daemon recién levantado (precondición exacta de este paso), pre-sintetiza los anuncios estáticos del plugin — el acuse de `UserPromptSubmit` («Procesando con Claude») y los fallbacks por evento — para que en cada turno se reproduzcan al instante con `speech play`, sin modelo ni daemon:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/narrate-ctl.js" presynth
```

Interpreta el resultado:

- **Exit `0`** → todos los anuncios quedaron pre-sintetizados (los ya existentes se
  reportan como «ya pre-sintetizado»: el comando es idempotente y es seguro repetirlo).
- **Fallo con «daemon caído» (exit `5` del motor)** → vuelve al **Paso 3** y
  reintenta.
- **Fallo con «modelo ausente» (exit `4` del motor)** → vuelve al **Paso 2**
  (`tts-sidecar setup`) y reintenta.

## Paso 5 — Activar la narración y, opcionalmente, el modo LLM

1. Asegura que la narración está activa y revisa el estado:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/narrate-ctl.js" on
   node "${CLAUDE_PLUGIN_ROOT}/dist/narrate-ctl.js" status
   ```

2. **Modo de mensajes** (pregunta al usuario su preferencia):
   - `local` (por defecto, 100 % offline, mensajes simples):
     `node "${CLAUDE_PLUGIN_ROOT}/dist/narrate-ctl.js" mode local`
   - `llm` (mensajes más elaborados vía Gemini free → OpenRouter `:free`):
     `node "${CLAUDE_PLUGIN_ROOT}/dist/narrate-ctl.js" mode llm`
3. Si elige `llm`, **advierte sobre privacidad**: contenido de la sesión sale
   hacia Google/OpenRouter. Las claves son del usuario; guíalo a definirlas por
   variable de entorno (tienen precedencia), sin escribirlas en el chat:
   - `GEMINI_API_KEY` (Gemini free tier) y/o `OPENROUTER_API_KEY` (modelos `:free`).
   - Alternativa: editar `config.json` en el state dir (la ruta la muestra `narrate-ctl.js status`). Sin claves, `llm` degrada a `local` de facto. Para que la clave persista entre sesiones, usa `config.json`; la variable de entorno solo vive en la terminal donde se definió.

## Paso 6 — Verificación de extremo a extremo

1. Diagnóstico final: `tts-sidecar doctor --json`. Confirma que `failed` es 0
   (los `WARN`/`SKIP` no cuentan).
2. Narración de prueba real (debe sonar audio):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/narrate-ctl.js" say "La narración por voz quedó lista"
   ```

3. Reproducción de un anuncio pre-sintetizado (verifica la ruta `speech play` que usará
   `UserPromptSubmit`): toma un label de la salida del Paso 4 (por ejemplo el de
   `UserPromptSubmit`, con forma `narrator-<hash>`) y reprodúcelo:

   ```bash
   tts-sidecar speech play --label <label-del-anuncio>
   ```

   Debe sonar el anuncio con exit `0`. Un exit `3` significa que el anuncio no está
   pre-sintetizado: repite el **Paso 4**.

   Pregunta al usuario si escuchó las locuciones. Si no:
   - Reconfirma que el daemon está `running` (Paso 3).
   - Revisa `worker.log` en el state dir (`narrate-ctl.js status` da la ruta) por
     errores de dispositivo de audio o CLI.

## Cierre

Confirma al usuario, en pocas frases, que a partir de ahora **cada sesión de Claude Code narrará automáticamente**: el hook `SessionStart` verifica el entorno y levanta el daemon si hace falta; luego **cada evento registrado** (`UserPromptSubmit`, `Stop`, `SubagentStop`, `StopFailure` y `Notification`) genera y reproduce una locución corta. El daemon se relevanta solo en la primera sesión tras un reinicio (hook `SessionStart`), así que no hay mantenimiento manual. Recuérdale los controles a demanda de la skill `/tts-sidecar-narrator:narrate` (`on`/`off`/`mode`/`status`/`say`/`presynth`).

Menciona también el mantenimiento de los anuncios pre-sintetizados: si se borra la caché del motor (`synthetic-speech/`) o cambia alguna frase de los anuncios en una actualización del plugin, basta re-ejecutar `node "${CLAUDE_PLUGIN_ROOT}/dist/narrate-ctl.js" presynth` con el daemon caliente (es idempotente; los anuncios vigentes no se re-sintetizan).
