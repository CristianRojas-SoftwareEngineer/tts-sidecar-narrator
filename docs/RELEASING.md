# Proceso de release

Cómo se corta y publica una versión de `tts-sidecar-narrator`. El proceso es
deliberadamente más simple que el del motor
([TTS-Sidecar/docs/RELEASING.md](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/blob/main/docs/RELEASING.md)):
aquí no hay CI de publicación, artefactos nativos ni PyPI — el plugin se
distribuye clonando el repo con `dist/` commiteado, y **el release es un tag de
git precedido por este checklist**. El CI de CircleCI corre en cada push como
verificación continua (no participa del corte); el marketplace de plugins de
Claude Code resuelve las versiones desde los tags del repo.

## Tabla de contenidos

- [Proceso de release](#proceso-de-release)
  - [Tabla de contenidos](#tabla-de-contenidos)
  - [Modelo de versionado](#modelo-de-versionado)
  - [Prerequisitos del corte](#prerequisitos-del-corte)
  - [Checklist de release](#checklist-de-release)
  - [Sincronización con un release del motor](#sincronización-con-un-release-del-motor)
  - [Después del tag](#después-del-tag)
  - [Bitácora del primer lanzamiento conjunto](#bitácora-del-primer-lanzamiento-conjunto)
    - [Fase 0 — Poner en verde el repo del plugin ✅ completada](#fase-0--poner-en-verde-el-repo-del-plugin--completada)
    - [Fase 1 — Release del motor publicado ✅ completada](#fase-1--release-del-motor-publicado--completada)
    - [Fase 2 — Smoke test contra el motor publicado ⏳ pendiente](#fase-2--smoke-test-contra-el-motor-publicado--pendiente)
    - [Fase 3 — Cortar el release del plugin ⏳ pendiente](#fase-3--cortar-el-release-del-plugin--pendiente)
    - [Fase 4 — Verificación posterior al corte ⏳ pendiente](#fase-4--verificación-posterior-al-corte--pendiente)

## Modelo de versionado

- Versionado Semántico, tags `vX.Y.Z`.
- La versión vive en **dos archivos que deben coincidir siempre**:
  `package.json` y `.claude-plugin/plugin.json`. Un release con los dos números
  distintos es un release inválido.
- El versionado es **independiente del motor**: cada proyecto numera según su
  propia historia. Excepción planificada: cuando TTS-Sidecar alcance su
  `v1.0.0`, el plugin avanzará desde la versión que haya alcanzado
  directamente a `v1.0.0` (ver la nota de versionado en
  [CHANGELOG.md](../CHANGELOG.md)).

## Prerequisitos del corte

Antes de empezar el checklist, en `main` debe estar todo en verde:

1. El pipeline de CircleCI (triple puerta `test-linux`/`test-windows`/
   `test-macos`) en verde sobre el commit candidato.
2. Ningún cambio pendiente en el árbol (`git status` limpio).

## Checklist de release

En orden; cada paso asume el anterior.

1. **Bump de versión doble**: actualizar `version` en `package.json` **y** en
   `.claude-plugin/plugin.json` al mismo `X.Y.Z`.
2. **Cortar la sección del changelog**: en `CHANGELOG.md`, renombrar
   `## [Unreleased]` a `## [X.Y.Z] — AAAA-MM-DD` y dejar la entrada lista
   (incluida la versión del motor contra la que se verificó, ver la sección
   de sincronización). Crear una nueva sección `## [Unreleased]` vacía encima
   y actualizar las referencias de enlaces del pie.
3. **Regenerar y verificar `dist/`**:
   ```bash
   npm run build
   npm run check-dist
   npm run typecheck
   npm test
   ```
   Commitear el `dist/` resultante junto con el bump. `check-dist` en verde es
   obligatorio: lo que ejecutan los usuarios es el `dist/` del árbol de git.
4. **Verificar la versión mínima del motor declarada**: la versión de
   TTS-Sidecar declarada en el README («Prerequisitos») y en
   [`docs/INTEGRATION.md`](INTEGRATION.md) («Requisitos sobre el motor») debe
   ser la que efectivamente se usó en el smoke test del paso 6.
5. **Verificar referencias cruzadas en ambos repos**: el motor referencia al
   plugin en `docs/NARRATION-INTEGRATION.md` y `docs/CLAUDE-CODE-PLUGIN.md` (del
   repo del motor);
   el plugin referencia al motor en `docs/INTEGRATION.md` y el README. Ambos
   lados deben apuntar a las versiones etiquetadas (o al menos no
   contradecirlas). Esta verificación vive aquí y no en el checklist del
   motor, porque el checklist del motor no conoce al plugin.
6. **Smoke test manual desde un clon limpio**: clonar el repo en un directorio
   nuevo (no usar el árbol de desarrollo), cargar el plugin en una sesión real
   de Claude Code y verificar, con el motor **instalado desde sus artefactos
   publicados** (no desde su árbol de desarrollo):
   - narración al final de un turno en modo `local` (sin claves);
   - narración en modo `llm` (con clave configurada);
   - `narrate-ctl status` reporta el estado sin exponer claves;
   - el aviso de `SessionStart` cuando el motor no está en el `PATH`.
7. **Commit, tag y push**:
   ```bash
   git commit -m "release: vX.Y.Z"
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```
   El tag es el punto de no retorno: el marketplace de plugins resuelve la
   versión desde los tags del repo, así que a partir del push del tag los
   usuarios pueden instalar exactamente ese estado.

## Sincronización con un release del motor

Cuando el release del plugin acompaña a un release del motor (como el primer
lanzamiento público conjunto), el orden importa — **primero el motor, después
el plugin**:

1. El motor corta su tag; su pipeline de CircleCI construye y publica los
   artefactos (binarios nativos + PyPI) automáticamente.
2. Se instala el motor **desde los artefactos publicados** (instalador nativo
   o `uv tool install tts-sidecar`), no desde `main` del motor, y se corre el
   smoke test del paso 6 contra esa instalación. Esto garantiza que lo que el
   plugin declara compatible es lo que un usuario real puede instalar, no un
   estado intermedio del árbol del motor.
3. Recién entonces se corta el tag del plugin, con la versión del motor
   verificada declarada en README, `docs/INTEGRATION.md` y la entrada del
   `CHANGELOG.md`.

Si el release del plugin **no** acompaña a uno del motor (una corrección
propia), basta el checklist normal: el smoke test se corre contra la última
versión publicada del motor, que sigue siendo la declarada como mínima.

## Después del tag

- Verificar que `/plugin marketplace add` + `/plugin install` resuelven la
  versión nueva en una máquina limpia.
- Si la entrada del changelog del motor menciona la disponibilidad del plugin,
  confirmar que el enlace apunta al tag correcto.
- Revisar si `docs/RELEASE-READINESS.md` (el registro vivo de preparación)
  debe archivarse o convertirse en el roadmap de la versión siguiente.

## Bitácora del primer lanzamiento conjunto

Esta sección registra, en tiempo real, el procedimiento concreto que se está
siguiendo para cortar el primer lanzamiento público sincronizado entre este
plugin y TTS-Sidecar. Es la aplicación práctica de la sección
[Sincronización con un release del motor](#sincronización-con-un-release-del-motor)
de arriba, con nombres de versión, fechas y estado real en lugar de pasos
genéricos. Se conserva como referencia hasta que el proceso quede rodado y esta
sección se archive.

El procedimiento consta de cuatro fases, ejecutadas en este orden:

### Fase 0 — Poner en verde el repo del plugin ✅ completada

Objetivo: que `main` pase la triple puerta de CI antes de tocar versiones, para
que el corte parta de una base verde.

1. **Push de los commits pendientes** (tests, CI, documentación) a `origin/main`
   (`git push origin main`).
2. **Registrar el proyecto en CircleCI**: como el repo aún no estaba seguido, se
   activó vía API (`follow`) y se disparó el primer pipeline sobre `main`.
3. **Verificar la triple puerta** `test-linux`/`test-windows`/`test-macos` en
   verde. Cada job corre la misma secuencia:
   `npm ci && npm run typecheck && npm run check-dist && npm test`.

### Fase 1 — Release del motor publicado ✅ completada

El plugin se verifica contra la **última versión publicada del motor**, no
contra su árbol de desarrollo (regla «primero el motor, después el plugin» de la
sección de sincronización). Al momento del corte, esa versión es
[`v0.7.5`](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/releases/tag/v0.7.5)
(2026-07-17):

1. `v0.7.5` es una **corrección de robustez de empaquetado** (PyInstaller): fija
   `--add-data` como fuente única de las voces de fábrica en el bundle. No hay
   cambios de contrato ni de comportamiento del CLI respecto a `v0.7.4`/`v0.7.3`
   —los artefactos son funcionalmente equivalentes—, de modo que el contrato que
   este plugin declara compatible se mantiene intacto. La contraparte de
   integración del motor con este plugin (`NARRATION-INTEGRATION.md`) ya venía
   publicada desde `v0.7.3`, así que el plugin llega al lanzamiento con el motor
   ya etiquetado por delante.
2. El pipeline `build-all` de CircleCI (disparado solo por tags `v*`) construyó
   y publicó los artefactos automáticamente (triple puerta de tests, builds
   nativos y los jobs de publicación a GitHub Releases y PyPI).
3. Verificación post-publicación (externa, comprobable) — hecha sin clonar el
   motor:
   ```bash
   gh release view v0.7.5 --repo CristianRojas-SoftwareEngineer/TTS-Sidecar
   pip index versions tts-sidecar   # 0.7.5 debe figurar como la más reciente
   ```
   El GitHub Release `v0.7.5` expone los 5 assets esperados (instalador Windows
   `tts-sidecar-0.7.5-x86_64-setup.exe`, AppImage x86_64 y arm64, `.dmg`
   arm64 y `SHA256SUMS.txt`), sus notas incluyen el enlace de oferta de fuente
   GPLv3 §6 al tarball del tag, y PyPI confirma `0.7.5` como versión publicada.

### Fase 2 — Smoke test contra el motor publicado ⏳ pendiente

Corresponde al paso 6 del [Checklist de release](#checklist-de-release) de
arriba, ejecutado contra los artefactos reales de `v0.7.5` (no contra el árbol
de desarrollo del motor):

1. **Instalar el motor publicado** y aprovisionarlo:
   ```bash
   uv tool install "tts-sidecar==0.7.5"   # o el instalador nativo del SO
   tts-sidecar version                    # debe imprimir 0.7.5
   tts-sidecar setup                      # descarga el modelo es-mx-latam
   ```
2. **Clonar el plugin en un directorio limpio** (no el árbol de desarrollo) y
   cargarlo en una sesión real de Claude Code:
   ```bash
   git clone https://github.com/CristianRojas-SoftwareEngineer/tts-sidecar-narrator
   cd tts-sidecar-narrator
   claude --plugin-dir .
   ```
3. **Verificar, de forma audible, cada superficie del contrato**. Para cada
   ítem, deja el entorno en la condición indicada, dispara la narración y
   escucha el resultado (los comandos `narrate-ctl` se resuelven a
   `dist/narrate-ctl.js`):

   - **Fin de turno en modo `local`** (sin claves):
     1. Selecciona el modo y confirma el estado:
        ```bash
        narrate-ctl mode local
        narrate-ctl status      # enabled: true, modo local, daemon running
        ```
        Si el daemon no está `running`, arráncalo: `tts-sidecar daemon start`.
     2. Termina un turno normal en la sesión (p. ej. pregunta algo simple). El
        hook `Stop` debe disparar una locución corta en español **sin** claves.
        Para no depender del hook puedes forzarla con `narrate-ctl say "prueba
        local"`.
   - **Modo `llm`** (con clave de proveedor):
     1. Define la clave en el entorno de la sesión, p. ej.
        `GEMINI_API_KEY=...` o `OPENROUTER_API_KEY=...` (tienen precedencia
        sobre `config.json`); o edítala en `config.json` del state dir. **Sin
        clave, `llm` degrada a `local`**, así que la clave es obligatoria para
        este ítem.
     2. Cambia el modo: `narrate-ctl mode llm`.
     3. Termina un turno y escucha: la locución suena, pero la construye la
        cadena LLM (más elaborada). Confirma en `worker.log` (su ruta la da
        `narrate-ctl status`) que se usó el proveedor y no la ruta local.
   - **`narrate-ctl status` no expone claves**:
     1. Ejecuta `narrate-ctl status` con y sin clave de proveedor definida.
     2. El resultado debe mostrar modo/estado/rutas, pero **nunca** los valores
        de `GEMINI_API_KEY` / `OPENROUTER_API_KEY` ni de `config.json`.
   - **Aviso de `SessionStart` sin motor en el `PATH`**:
     1. Quita temporalmente el binario del `PATH` (renombra `tts-sidecar` o
        arranca la sesión con un `PATH` recortado).
     2. Abre una sesión nueva (dispara `SessionStart`). Debe aparecer el aviso
        de que falta el CLI/modelo y la sesión **no** se bloquea: puedes seguir
        trabajando (degradación silenciosa).

Esta fase requiere verificación humana (audible) y no puede automatizarse por
completo; es la única fase que el usuario debe ejecutar personalmente. La
porción no audible (que `narrate-ctl status` no filtra claves y que
`health-check` avisa sin bloquear) ya quedó pre-verificada en local; ver
[`RELEASE-READINESS.md`](RELEASE-READINESS.md).

### Fase 3 — Cortar el release del plugin ⏳ pendiente

Una vez confirmado el smoke test de la Fase 2, se ejecuta el
[Checklist de release](#checklist-de-release) completo con los números de este
lanzamiento:

1. **Confirmar la versión mínima del motor** declarada en el README
   («Prerequisitos») y en [`docs/INTEGRATION.md`](INTEGRATION.md) («Requisitos
   sobre el motor»): debe ser `v0.7.5`, la verificada en la Fase 2.
2. **Bump de versión doble** a `0.1.0` en `package.json` **y**
   `.claude-plugin/plugin.json` (los dos números deben coincidir).
3. **Cortar el changelog**: renombrar `## [Unreleased]` a
   `## [0.1.0] — AAAA-MM-DD` dejando declarada la verificación contra
   TTS-Sidecar v0.7.5, crear una nueva `## [Unreleased]` vacía encima y
   actualizar las referencias de enlaces del pie.
4. **Regenerar y verificar `dist/`**, y commitearlo junto con el bump:
   ```bash
   npm run build && npm run check-dist && npm run typecheck && npm test
   ```
5. **Verificar las referencias cruzadas** con el motor
   (`docs/NARRATION-INTEGRATION.md` y `docs/CLAUDE-CODE-PLUGIN.md`, del lado del
   motor; README y `docs/INTEGRATION.md` del lado del plugin).
6. **Commit, tag y push** — punto de no retorno, a partir del cual el
   marketplace resuelve exactamente ese estado:
   ```bash
   git commit -m "release: v0.1.0"
   git tag v0.1.0
   git push origin main v0.1.0
   ```

### Fase 4 — Verificación posterior al corte ⏳ pendiente

Los pasos de [Después del tag](#después-del-tag), ejecutados sobre el tag ya
publicado:

1. **Resolución desde una máquina limpia**: en una instalación de Claude Code
   sin este plugin, `/plugin marketplace add` (apuntando a este repo) seguido de
   `/plugin install tts-sidecar-narrator` debe resolver e instalar `v0.1.0` —el
   estado exacto del tag, no la punta de `main`.
2. **Enlace desde el motor**: si la entrada del `CHANGELOG.md` del motor
   menciona la disponibilidad del plugin, confirmar que el enlace apunta al tag
   correcto.
3. **Cierre del registro vivo**: decidir si `docs/RELEASE-READINESS.md` se
   archiva o se convierte en el roadmap de la versión siguiente y —una vez
   rodado el proceso— archivar esta bitácora.
