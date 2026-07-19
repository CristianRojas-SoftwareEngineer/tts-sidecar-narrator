# tts-sidecar-narrator

Plugin de [Claude Code](https://code.claude.com) que **narra por voz** la actividad de la sesión usando [TTS-Sidecar](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar). Al final de cada turno (y en avisos relevantes) escuchas un mensaje conversacional corto — no el texto en bruto del asistente, sino una locución procesada, en español.

- **Automático**: disparado por hooks; sin intervención del modelo ni tuya.
- **No intrusivo**: nunca bloquea ni retrasa el turno; falla en silencio si
  TTS-Sidecar no está disponible.
- **Multiplataforma**: Windows / Linux / macOS, misma experiencia.
- **Sin prerequisitos de runtime**: los scripts corren sobre el Node.js que
  Claude Code ya trae; no exige Python.
- **Costo cero**: los mensajes se generan con niveles gratuitos de LLM (Gemini
  free → OpenRouter `:free`) y degradan a un modo local determinista.
- **Controlable**: activa/desactiva la narración sin desinstalar.

> Este repositorio es la fuente de verdad del plugin. El documento de diseño
> original (`TTS-Sidecar/docs/CLAUDE-CODE-PLUGIN.md`, en el repo del motor) sirvió de
> especificación inicial y hoy es solo un puntero histórico a este repo.

## Tabla de contenidos

- [Prerequisitos](#prerequisitos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Privacidad](#privacidad)
- [Desarrollo](#desarrollo)
- [Documentación](#documentación)
- [Licencia](#licencia)

## Prerequisitos

1. **TTS-Sidecar ≥ v0.7.5** instalado (instalador nativo o
   `uv tool install tts-sidecar`) y aprovisionado — v0.7.5 es la versión del
   motor contra la que este plugin fue verificado; versiones anteriores pueden
   funcionar pero no están cubiertas por el contrato de
   [`docs/INTEGRATION.md`](docs/INTEGRATION.md):
   ```bash
   tts-sidecar setup
   ```
   El plugin lo verifica al iniciar la sesión (`SessionStart`) y te avisa si
   falta el CLI o el modelo. El plugin **no** instala TTS-Sidecar.
2. *(Opcional)* **API keys gratuitas** para mensajes generados por LLM:
   - [Gemini API](https://ai.google.dev/) (free tier) — principal.
   - [OpenRouter](https://openrouter.ai/) (modelos `:free`) — fallback.

   Sin keys, el plugin funciona en modo **local** (determinista, 100 % offline).

Node.js ya está presente por ser el runtime de Claude Code; los scripts se distribuyen compilados en `dist/`, así que **no hay `npm install` ni build** en tu máquina.

## Instalación

El flujo para el usuario final es de **dos pasos**:

1. **Instalar el plugin** desde un marketplace (repo git), lo que persiste entre
   sesiones:
   ```
   /plugin marketplace add CristianRojas-SoftwareEngineer/tts-sidecar-narrator
   /plugin install tts-sidecar-narrator@tts-sidecar-narrator
   ```
2. **Instalar y configurar el motor** invocando el comando de instalación
   guiado, que detecta el SO, instala el binario TTS-Sidecar (vía `uv`/`pipx` o
   el instalador nativo), descarga el modelo, deja el daemon listo y activa la
   narración:
   ```
   /tts-sidecar-narrator:install
   ```

Durante el desarrollo, el plugin se carga apuntando al directorio del repo (no persiste; hay que pasarlo en cada arranque):

```bash
claude --plugin-dir .
```

## Configuración

El estado vive en `config.json` dentro del *state dir* por SO:

| SO | Ruta |
|----|------|
| Windows | `%LOCALAPPDATA%\tts-sidecar-narrator\config.json` |
| Linux | `${XDG_STATE_HOME:-~/.local/state}/tts-sidecar-narrator/config.json` |
| macOS | `~/Library/Application Support/tts-sidecar-narrator/config.json` |

```json
{
  "enabled": true,
  "messageMode": "llm",
  "geminiApiKey": "…",
  "openRouterApiKey": "…"
}
```

- `enabled`: interruptor global de la narración.
- `messageMode`: `"llm"` (cadena completa) o `"local"` (solo constructor
  determinista, sin red). Sin ninguna key, `"llm"` degrada a `"local"` de facto.
- Las variables de entorno `GEMINI_API_KEY` y `OPENROUTER_API_KEY` **tienen
  precedencia** sobre el archivo.

El archivo se crea con permisos restrictivos (0600 en POSIX) por contener credenciales. La skill opcional (`/tts-sidecar-narrator:narrate`) guía la configuración y expone los toggles.

## Privacidad

El modo `llm` envía contenido de la sesión (mensajes del asistente, extracto del transcript) a un tercero (Google u OpenRouter). Es un cambio de postura respecto al motor TTS-Sidecar, que sintetiza 100 % offline. Por eso:

1. El modo `llm` **solo se activa cuando configuras tus claves** — un opt-in
   explícito.
2. `messageMode: "local"` ofrece la experiencia completa sin que ningún dato
   salga de tu máquina (mensajes menos elaborados).

## Desarrollo

```bash
npm install       # solo para desarrollo (typescript, esbuild)
npm run typecheck # verificación de tipos
npm run build     # compila src/ → dist/ (commitear dist/)
npm run check-dist # verifica que dist/ está sincronizado con src/
npm test          # suite de tests (node --test, sin framework externo)
```

`dist/` **se commitea**: los plugins se instalan clonando el repo, así que el JS
compilado debe estar en el árbol para que los hooks funcionen sin paso de build.

El CI (CircleCI, [.circleci/config.yml](.circleci/config.yml)) corre `typecheck`, `check-dist` y la suite de tests en Linux, Windows y macOS en cada push — el mismo proveedor y nomenclatura de jobs que usa el motor.

## Documentación

- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) — integración con el motor
  TTS-Sidecar desde la perspectiva del plugin: contrato del CLI, uso por cada
  hook, requisitos y degradación. Su contraparte, desde la perspectiva del
  motor, está en
  [TTS-Sidecar/docs/NARRATION-INTEGRATION.md](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/blob/main/docs/NARRATION-INTEGRATION.md).
- [`docs/RELEASING.md`](docs/RELEASING.md) — proceso de release del plugin y
  su sincronización con los releases del motor.
- [`SECURITY.md`](SECURITY.md) — política de seguridad y modelo de amenaza del
  plugin (credenciales, modo `llm`, cadena de suministro).
- [`CHANGELOG.md`](CHANGELOG.md) — cambios notables por versión.
- [`docs/RELEASE-READINESS.md`](docs/RELEASE-READINESS.md) — registro vivo de
  la preparación del primer release público sincronizado con el motor.

## Licencia

GPL-3.0-or-later.
