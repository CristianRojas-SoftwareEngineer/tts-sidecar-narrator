# Changelog

Todos los cambios notables de `tts-sidecar-narrator` se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/).

> **Nota sobre el versionado**: este plugin y su motor,
> [TTS-Sidecar](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar),
> llevan versionados **independientes**, cada uno reflejo de su propia historia
> de desarrollo — lo que se sincroniza entre ambos es el lanzamiento, no el
> número. La disparidad de números es temporal por decisión: durante el tramo
> pre-1.0 el plugin publica sus versiones intermedias (`0.2.0`, `0.3.0`, …) a
> su propio ritmo, y cuando TTS-Sidecar alcance su `v1.0.0`, el plugin
> **avanzará desde la versión que haya alcanzado hasta ese momento
> directamente a `1.0.0`**, en un release que acumule las correcciones
> implementadas hasta entonces. Ese salto final de numeración será entonces
> intencional, no un error de versionado.

## [Unreleased]

Primera versión pública, lanzada en conjunto con el primer release público del motor TTS-Sidecar. Verificada contra **TTS-Sidecar v0.7.6** (el número final se fija en el corte sincronizado; ver [docs/RELEASING.md](docs/RELEASING.md)).

### Añadido

- **Narración automática por hooks**: al final de cada turno (`Stop`) y en
  avisos relevantes (`Notification`), el plugin construye una locución corta
  en español y la sintetiza vía el CLI `tts-sidecar` (daemon caliente).
  El worker corre desanclado y nunca bloquea ni retrasa el turno.
- **Verificación del entorno en `SessionStart`** (`health-check`): comprueba
  CLI y modelo con `doctor --json`, levanta el daemon si hace falta y avisa —
  sin bloquear — si el motor no está instalado.
- **Dos modos de generación de mensajes**: `llm` (Gemini free → OpenRouter
  `:free`, con opt-in explícito vía API keys) y `local` (determinista,
  100 % offline, el comportamiento por defecto sin claves). La cadena de
  providers degrada en silencio nivel a nivel.
- **Saneamiento para voz** (`sanitize.ts`): elimina markdown, bloques de
  código con su contenido, código en línea y URLs antes de narrar o de enviar
  texto a un proveedor externo.
- **Superficie de control** (`narrate-ctl`): subcomandos `on`/`off`/`mode`/
  `status`/`say`; `status` nunca imprime el valor de una clave.
- **Comando de instalación guiada** (`/tts-sidecar-narrator:install`) y
  **skill de configuración** (`/tts-sidecar-narrator:narrate`).
- **Suite de tests** (`node --test`, sin dependencias nuevas): 95 tests sobre
  saneamiento, constructor local, cadena de providers, configuración y
  precedencia de claves, parseo del payload de hooks, resolución del state
  dir y del CLI en los tres SO, contrato de los providers con `fetch`
  mockeado, y subcomandos de `narrate-ctl` como subproceso real.
- **CI en CircleCI**: triple puerta `test-linux`/`test-windows`/`test-macos`
  (misma plataforma y nomenclatura que el motor) en cada push, corriendo
  typecheck, verificación de `dist/` sincronizado y la suite completa.
- **Documentación**: README, `docs/INTEGRATION.md` (contrato con el motor),
  `SECURITY.md` (modelo de amenaza del plugin, incluida la semántica real de
  la protección del `config.json` en Windows), `docs/RELEASING.md` (proceso
  de release y sincronización con el motor) y este changelog.

[Unreleased]: https://github.com/CristianRojas-SoftwareEngineer/tts-sidecar-narrator/commits/main
