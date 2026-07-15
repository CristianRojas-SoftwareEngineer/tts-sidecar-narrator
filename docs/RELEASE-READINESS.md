# Estado de preparación para un release público

Este documento registra qué le falta a `tts-sidecar-narrator` en **testing** y
**documentación** para acercarse al nivel de completitud de su proyecto hermano,
[TTS-Sidecar](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar)
(572 tests pytest en verde, CI multiplataforma, `docs/GOAL.md`/`docs/ROADMAP.md`
como registro vivo del estado). Es un registro de brechas, no un plan de
implementación: cada sección describe el hueco y una recomendación, sin
comprometer una fecha.

## Tabla de contenidos

- [Estado actual](#estado-actual)
- [Testing](#testing)
- [CI/CD](#cicd)
- [Documentación](#documentación)
- [Versionado y releases](#versionado-y-releases)
- [Gestión de API keys — nota de transparencia](#gestión-de-api-keys--nota-de-transparencia)

## Estado actual

Lo que ya existe y está en buen estado:

- README, `docs/INTEGRATION.md`, `commands/install.md` y `skills/narrate/SKILL.md`
  documentan instalación, configuración, privacidad y el contrato con el motor.
- `npm run typecheck` y `npm run check-dist` dan una señal mínima de correctud
  (tipos + `dist/` sincronizado con `src/`), pero ninguno de los dos corre en CI
  hoy — son manuales.
- Diseño de configuración/claves ya sigue buenas prácticas (ver la última
  sección de este documento).
- Licencia (GPL-3.0-or-later) y atribución de autoría presentes.

Lo que falta se agrupa en tres brechas: **cero tests**, **cero CI**, y **release
sin cortar** (sigue en `0.1.0`, sin tags).

## Testing

No existe ningún archivo de test en el repo. Para un plugin que orquesta hooks,
un worker desacoplado y una cadena de providers LLM externos, el riesgo de una
regresión silenciosa es real: un cambio en `provider-chain.ts` o `sanitize.ts`
podría filtrar contenido no saneado a un tercero, o romper el fallback
Gemini → OpenRouter → local sin que nada lo detecte hasta producción.

Priorización sugerida, de mayor a menor retorno por esfuerzo (lo puro primero,
lo que requiere mocks de red o del sistema de archivos después):

| Módulo | Qué testear | Por qué es prioritario |
|--------|-------------|-------------------------|
| `src/message/sanitize.ts` | Que el saneamiento efectivamente quita lo que dice quitar (markdown, rutas, bloques de código) antes de narrar o de enviar a un LLM externo | Es la única barrera antes de que texto de la sesión salga hacia un tercero en modo `llm` |
| `src/message/local-builder.ts` | Casos borde de construcción determinista del mensaje local (input vacío, muy largo, sin contexto) | Es el modo de degradación por defecto (offline); si se rompe, se rompe la narración para todo usuario sin claves configuradas |
| `src/message/provider-chain.ts` | Orden de fallback Gemini → OpenRouter → local; que un fallo de un provider (429, timeout, HTTP error) cae al siguiente y no se propaga | Es el corazón del "costo cero con degradación local"; un bug aquí puede dejar la narración muda o filtrar errores al usuario |
| `src/lib/config.ts` | Precedencia env var > archivo > defaults; `emptyToUndef` con strings vacíos/whitespace; que `updateConfig` hace merge parcial y no pisa claves no tocadas | Es donde viven las credenciales; un bug de precedencia podría usar una clave vieja o ignorar una nueva sin aviso |
| `src/lib/resolve-cli.ts` | Resolución del binario `tts-sidecar` en `PATH` respetando `PATHEXT` en Windows; caso "no está" | Superficie multiplataforma con lógica condicional por SO, fácil de romper sin notar en una sola plataforma de desarrollo |
| `src/message/gemini-provider.ts` / `openrouter-provider.ts` | Con `fetch` mockeado: parseo de la respuesta, manejo de HTTP no-ok, respuesta vacía → error | Menor prioridad que el resto porque son adaptadores delgados, pero cualquier framework de test moderno permite mockear `fetch` sin red real |
| `src/narrate-ctl.ts` | Cada subcomando (`on`/`off`/`mode`/`status`/`say`) con `config.ts` real sobre un state dir temporal | Es la superficie que invoca la skill; un test de humo por subcomando evita regresiones de UX |

No hay un framework de test instalado (`package.json` no tiene `devDependencies`
de testing). Dado que el proyecto ya usa TypeScript + `esbuild` y Node nativo
para todo lo demás, el corredor de test nativo de Node (`node --test`, sin
dependencia nueva) es la opción de menor fricción y más alineada con "sin
runtime extra" que ya es un principio del plugin (ver README, "Sin
prerequisitos de runtime"). Vitest/Jest son alternativas si se prioriza DX de
test sobre minimizar dependencias.

## CI/CD

No existe ningún workflow (`.github/workflows` no existe). Hoy `typecheck`,
`build` y `check-dist` son responsabilidad manual del autor antes de cada
commit — no hay gate automático que impida mergear un `dist/` desincronizado de
`src/` o un error de tipos.

Recomendación mínima para un primer release: un workflow que en cada push/PR a
`main` corra `npm ci && npm run typecheck && npm run check-dist` (y, una vez
exista test runner, `npm test`). No requiere secretos ni credenciales de
Gemini/OpenRouter — los tests de los providers deben mockear `fetch`, no
llamar a las APIs reales.

## Documentación

Comparado con la cobertura documental de TTS-Sidecar (`docs/GOAL.md`,
`docs/ROADMAP.md`, `SECURITY.md`, `docs/RELEASING.md`), al plugin le faltan:

- **Un documento de seguridad dedicado** (`SECURITY.md` o una sección propia):
  hoy la política de manejo de claves vive repartida entre `README.md`
  ("Configuración"), `commands/install.md` y `skills/narrate/SKILL.md`. Cada
  uno la repite parcialmente para su propio propósito (guiar al agente), lo
  cual está bien para esos documentos, pero no hay un lugar único que declare
  el modelo de amenaza completo (qué se persiste, dónde, con qué permisos, qué
  pasa en Windows sin ACL restrictiva, qué sale hacia terceros y bajo qué
  opt-in). Ver la última sección de este documento como borrador de contenido.
- **Un `CHANGELOG.md`**: no existe; con la primera versión etiquetada es el
  momento natural de empezarlo.
- **Un proceso de release documentado**, análogo a
  [`TTS-Sidecar/docs/RELEASING.md`](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/blob/main/docs/RELEASING.md):
  qué implica cortar una versión de un plugin de Claude Code (bump de versión
  en `package.json` **y** en `.claude-plugin/plugin.json`, que `dist/` esté
  actualizado y verificado con `check-dist`, tag de git, y qué valida el
  marketplace al resolver la versión).

## Versionado y releases

El repo sigue en `0.1.0` sin tags (`git tag` no devuelve nada), a diferencia de
TTS-Sidecar que ya lleva varias versiones etiquetadas (`v0.7.2` la más
reciente). Antes de anunciar el plugin conviene cortar un primer tag real
(`v0.1.0` o `v1.0.0`, según el criterio de estabilidad que se quiera comunicar)
una vez cerradas las brechas de testing/CI de arriba, para que el marketplace
resuelva una versión fija en vez de la punta de `main`.

## Gestión de API keys — nota de transparencia

El diseño actual ya sigue buenas prácticas y **no requiere `.env`/`.env.example`**:
el plugin se distribuye clonando el repo (`dist/` commiteado), así que un
`.env` en la raíz viviría dentro del árbol compartido por todos los usuarios
del clon y se pisaría en cada actualización — el lugar correcto para el
secreto de cada usuario es fuera del repo, igual que `TTS-Sidecar` resuelve su
`data_root()`.

Resumen del diseño (`src/lib/config.ts`, `src/lib/state-dir.ts`):

- Las claves se leen con precedencia **variable de entorno > `config.json` en
  el state dir por SO > sin configurar** (degrada a modo `local`).
- `config.json` nunca vive en el repo; se crea en tiempo de ejecución en
  `%LOCALAPPDATA%\tts-sidecar-narrator` (Windows), `~/.local/state/tts-sidecar-narrator`
  (Linux) o `~/Library/Application Support/tts-sidecar-narrator` (macOS).
- El archivo se escribe con permisos `0600` en POSIX.
- Ninguna skill ni comando pide o maneja la clave dentro del chat (evita que
  quede en el transcript); ambas guían al usuario a variable de entorno o
  edición directa del archivo.
- `narrate-ctl.js status` nunca imprime el valor de la clave, solo si está
  configurada.

Brecha identificada (no es una vulnerabilidad, es una omisión de
documentación): el `0600` es **no-op en Windows** (el comentario en el código
ya lo advierte), y ni el README ni ningún doc explican qué protege realmente al
usuario de Windows en ese caso — en la práctica, las ACL por defecto del perfil
de usuario sobre `%LOCALAPPDATA%` (no accesible a otras cuentas locales sin
privilegios elevados), pero eso hoy es tribal knowledge en un comentario de
código, no algo que el usuario pueda leer. Recomendación: una frase explícita
en el `SECURITY.md` propuesto arriba, y opcionalmente advertir en el `status`
o en el propio README que en Windows la protección depende de las ACL del
perfil, no de un permiso de archivo explícito.
