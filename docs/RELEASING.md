# Proceso de release

Cómo se corta y publica una versión de `tts-sidecar-narrator`. El proceso es deliberadamente más simple que el del motor ([TTS-Sidecar/docs/RELEASING.md](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/blob/main/docs/RELEASING.md)): aquí no hay CI de publicación, artefactos nativos ni PyPI — el plugin se distribuye clonando el repo con `dist/` commiteado, y **el release es un tag de git precedido por este checklist**. El CI de CircleCI corre en cada push como verificación continua (no participa del corte); el marketplace de plugins de Claude Code resuelve las versiones desde los tags del repo.

## Tabla de contenidos

- [Proceso de release](#proceso-de-release)
  - [Tabla de contenidos](#tabla-de-contenidos)
  - [Modelo de versionado](#modelo-de-versionado)
  - [Prerequisitos del corte](#prerequisitos-del-corte)
  - [Checklist de release](#checklist-de-release)
  - [Sincronización con un release del motor](#sincronización-con-un-release-del-motor)
  - [Después del tag](#después-del-tag)
  - [Runbook del primer lanzamiento conjunto](#runbook-del-primer-lanzamiento-conjunto)
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
   - narración de **todas** las superficies del contrato (los cinco hooks
     registrados en `hooks/hooks.json`: `UserPromptSubmit`, `Stop`,
     `SubagentStop`, `StopFailure` y `Notification`) en modo `local` (sin claves)
     y en modo `llm` (con clave configurada); no basta con `Stop` — una superficie
     no probada puede liberarse con un bug;
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

Cuando el release del plugin acompaña a un release del motor (como el primer lanzamiento público conjunto), el orden importa — **primero el motor, después el plugin**:

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

Si el release del plugin **no** acompaña a uno del motor (una corrección propia), basta el checklist normal: el smoke test se corre contra la última versión publicada del motor, que sigue siendo la declarada como mínima.

## Después del tag

- Verificar que `/plugin marketplace add` + `/plugin install` resuelven la
  versión nueva en una máquina limpia.
- Si la entrada del changelog del motor menciona la disponibilidad del plugin,
  confirmar que el enlace apunta al tag correcto.
- Revisar si `docs/RELEASE-READINESS.md` (el registro vivo de preparación)
  debe archivarse o convertirse en el roadmap de la versión siguiente.

## Runbook del primer lanzamiento conjunto

Runbook ejecutable del primer lanzamiento público sincronizado entre este plugin y TTS-Sidecar. Es la aplicación práctica de la sección [Sincronización con un release del motor](#sincronización-con-un-release-del-motor) de arriba: en lugar de pasos genéricos, cada fase lista los **comandos concretos** (PowerShell 7 sobre Windows 11) y la **comprobación** de cada paso. Sirve a la vez de registro vivo del procedimiento real (nombres de versión, fechas y estado), y se conserva como referencia hasta que el proceso quede rodado y se archive.

El procedimiento consta de cinco fases, ejecutadas en este orden:

### Convenciones y variables (aplican a todas las fases)

Todos los comandos asumen PowerShell 7 (`pwsh`) en Windows 11. Estas variables y el atajo se reutilizan en varias fases; defínelos una vez por sesión de PowerShell:

```powershell
# Árbol de desarrollo del plugin (Fases 0 y 3: CI y corte del release).
$PLUGIN_DEV = "C:\Users\Cristian\Desktop\Proyectos\Voices\tts-sidecar-narrator"

# Clon limpio para el E2E (Fase 2), separado del árbol de desarrollo.
$PLUGIN_E2E = "C:\Users\Cristian\Desktop\tts-sidecar-narrator"

# State dir del plugin (Windows): %LOCALAPPDATA%\tts-sidecar-narrator.
$STATE_DIR = "$env:LOCALAPPDATA\tts-sidecar-narrator"

# (Opcional) Árbol del repo del motor, para las comprobaciones cruzadas de
# Fases 3-4. Solo si lo tienes clonado localmente.
$ENGINE_ROOT = "C:\Users\Cristian\Desktop\Proyectos\Voices\TTS-Sidecar"

# Atajo para invocar la CLI de control compilada; apunta al clon del E2E,
# que es donde se ejecuta la Fase 2.
function narrate-ctl { node "$PLUGIN_E2E\dist\narrate-ctl.js" @args }
```

Notas de contrato que el runbook asume (verificado en código fuente):

- `narrate-ctl status` **no** reporta el daemon; el estado del daemon se consulta
  con `tts-sidecar daemon status --json`.
- `narrate-ctl status` **nunca** imprime el valor de ninguna clave: solo muestra
  `gemini key:   configurada|ausente` y `openrouter:   configurada|ausente`.
- `narrate-ctl say` pasa el texto directo a `tts-sidecar speak --text ... --daemon`
  (pipeline TTS + daemon); **no** ejercita la generación de mensaje (`local`/`llm`).
- `worker.log` (en `$STATE_DIR`) registra **solo errores** de narración, no qué
  proveedor se usó; la distinción `local` vs `llm` se verifica **por audible**
  (ver Fase 2, ítems 2 y 3).

### Fase 0 — Poner en verde el repo del plugin ✅ completada

Objetivo: que `main` pase la triple puerta de CI antes de tocar versiones, para que el corte parta de una base verde.

1. **Push de los commits pendientes** (tests, CI, documentación) a `origin/main`:
   ```powershell
   git -C $PLUGIN_DEV push origin main
   # Comprobación: el push termina sin error y `git status` está limpio.
   git -C $PLUGIN_DEV status --short   # debe estar vacío
   ```
2. **Registrar el proyecto en CircleCI** (solo la primera vez; el repo aún no
   estaba seguido por CircleCI):
   ```powershell
   # Requiere CIRCLE_TOKEN con permiso en la org del proyecto.
   $CIRCLE_TOKEN = "<tu-token-circleci>"
   $REPO = "CristianRojas-SoftwareEngineer/tts-sidecar-narrator"
   # 2a. Seguir el proyecto (follow) vía API.
   Invoke-RestMethod -Method Post `
     -Uri "https://circleci.com/api/v2/project/gh/$REPO/follow" `
     -Headers @{ "Circle-Token" = $CIRCLE_TOKEN } | Out-Null
   # 2b. Disparar el primer pipeline sobre main.
   Invoke-RestMethod -Method Post `
     -Uri "https://circleci.com/api/v2/project/gh/$REPO/pipeline" `
     -Headers @{ "Circle-Token" = $CIRCLE_TOKEN } `
     -ContentType "application/json" -Body '{"branch":"main"}' | Out-Null
   # Comprobación: el proyecto aparece como seguido.
   Invoke-RestMethod -Uri "https://circleci.com/api/v2/project/gh/$REPO" `
     -Headers @{ "Circle-Token" = $CIRCLE_TOKEN }
   ```
3. **Verificar la triple puerta** `test-linux`/`test-windows`/`test-macos` en
   verde. Cada job corre la misma secuencia
   `npm ci && npm run typecheck && npm run check-dist && npm test`.
   ```powershell
   # Comprobación: consultar el estado del último workflow sobre main.
   $WF = (Invoke-RestMethod `
       -Uri "https://circleci.com/api/v2/project/gh/$REPO/pipeline" `
       -Headers @{ "Circle-Token" = $CIRCLE_TOKEN }).items[0].id
   Invoke-RestMethod `
     -Uri "https://circleci.com/api/v2/pipeline/$WF/workflow" `
     -Headers @{ "Circle-Token" = $CIRCLE_TOKEN }
   # Los tres jobs (test-linux / test-windows / test-macos) deben decir "success".
   # Equivalente local (misma secuencia que el CI), para validar antes de mirar la UI:
   Push-Location $PLUGIN_DEV
   npm ci; npm run typecheck; npm run check-dist; npm test
   Pop-Location
   # Comprobación: el último comando (npm test) termina con 0 fallos.
   ```

### Fase 1 — Release del motor publicado ✅ completada

El plugin se verifica contra la **última versión publicada del motor**, no contra su árbol de desarrollo (regla «primero el motor, después el plugin» de la sección de sincronización). Al momento del corte, esa versión es [`v0.7.7`](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/releases/tag/v0.7.7) (2026-07-22):

1. `v0.7.7` corrige la **eliminación de ruido/estática al final de la síntesis de audio**
   (runtime en `audio_writer.py`): aplica un desvanecimiento suave (*fade-out* de 15 ms)
   y un relleno de silencio de cola (50 ms) para prevenir la discontinuidad de fase
   y evitar estallidos de estática al finalizar la locución.
2. El pipeline `build-all` de CircleCI (disparado solo por tags `v*`) construyó
   y publicó los artefactos automáticamente (triple puerta de tests, builds
   nativos y los jobs de publicación a GitHub Releases y PyPI).
3. Verificación post-publicación (externa, comprobable) — hecha sin clonar el
   motor:
   ```powershell
   # 3a. El GitHub Release v0.7.7 expone los 5 assets esperados:
   #     instalador Windows tts-sidecar-0.7.7-x86_64-setup.exe,
   #     AppImage x86_64 y arm64, .dmg arm64 y SHA256SUMS.txt.
   #     Sus notas incluyen el enlace de oferta de fuente GPLv3 §6 al tarball.
   gh release view v0.7.7 --repo CristianRojas-SoftwareEngineer/TTS-Sidecar
   # Comprobación: la salida lista los 5 assets y el enlace GPLv3 §6.

   # 3b. PyPI confirma 0.7.7 como versión publicada y más reciente.
   pip index versions tts-sidecar
   # Comprobación: "0.7.7" figura como la versión disponible más reciente.
   ```

### Fase 2 — Smoke test contra el motor publicado ⏳ pendiente

Corresponde al paso 6 del [Checklist de release](#checklist-de-release) de arriba, ejecutado contra los artefactos reales de `v0.7.7` (no contra el árbol de desarrollo del motor). Es un **E2E audible en Windows 11 (PowerShell 7)**: el usuario lo ejecuta personalmente; aquí cada paso tiene su comando y su comprobación. Las variables `$PLUGIN_E2E`/`$STATE_DIR`/`narrate-ctl` vienen de [Convenciones y variables](#convenciones-y-variables-aplican-a-todas-las-fases).

#### Paso 1 — Instalar y aprovisionar el motor publicado

```powershell
# 1a. Instalar el motor fijando la versión verificada (uv tool es opcional;
#     también sirve el instalador nativo tts-sidecar-0.7.7-x86_64-setup.exe).
uv tool install "tts-sidecar==0.7.7"

# 1b. Comprobación: el CLI resuelve y reporta 0.7.7.
tts-sidecar version          # debe imprimir: 0.7.7

# 1c. Aprovisionar el modelo es-mx-latam + Voice Encoder (descarga a la caché
#     de HuggingFace; idempotente: salta si ya está). Puede tardar minutos.
tts-sidecar setup

# 1d. Comprobación: el modelo quedó en caché (doctor sin FAIL de modelo).
tts-sidecar doctor --json | ConvertFrom-Json |
  ForEach-Object { $_.checks } | Where-Object { $_.status -eq 'FAIL' }
#     La salida debe estar VACÍA (ningún FAIL). El check "Chatterbox model"
#     debe decir PASS.
```

#### Paso 2 — Dejar el daemon en marcha

```powershell
tts-sidecar daemon start
# Comprobación: el daemon queda running.
tts-sidecar daemon status --json | ConvertFrom-Json | ForEach-Object { $_.running }
#     Debe imprimir: True
```

#### Paso 3 — Clonar el plugin en un directorio limpio

No uses el árbol de desarrollo para el E2E: clona una copia fresca (en este runbook, al `Desktop`, ya preparado en fases previas).

```powershell
# Si el clon limpio ya existe en $PLUGIN_E2E, omite esto.
if (-not (Test-Path $PLUGIN_E2E)) {
  git clone https://github.com/CristianRojas-SoftwareEngineer/tts-sidecar-narrator $PLUGIN_E2E
}
# Comprobación: el dist/ compilado existe (es lo que ejecutan los hooks).
Test-Path "$PLUGIN_E2E\dist\narrate-ctl.js"   # debe ser True
```

#### Paso 4 — Comprobación base (sin sesión de Claude)

Valida el pipeline TTS + daemon de forma aislada, antes de involucrar los hooks. No requiere claves.

```powershell
narrate-ctl on                        # activa la narración
narrate-ctl mode local                # modo local (determinista, offline)
narrate-ctl status                    # enabled: true, messageMode: local
tts-sidecar daemon status --json | ConvertFrom-Json | ForEach-Object { $_.running }
#     Debe ser True (si no, `tts-sidecar daemon start`).
narrate-ctl say "Prueba de audio local"   # emite una locución
# Comprobación AUDIBLE: se escucha la frase en español. Si no suena, revisa
# worker.log: Get-Content "$STATE_DIR\worker.log" -Tail 20
```

#### Paso 5 — Verificación completa por superficie del contrato (audible)

Cada ítem deja el entorno en la condición indicada, dispara la narración y **escucha** el resultado. El plugin registra **cinco hooks de narración** (todos vía `dist/narrate-hook.js`, ver `hooks/hooks.json`): `UserPromptSubmit`, `Stop`, `SubagentStop`, `StopFailure` y `Notification`. El smoke test debe ejercitar **cada uno** en ambos modos (`local` y `llm`): una superficie no probada puede liberarse con un bug no detectado. Para cada ítem se abre Claude Code con el plugin cargado desde el clon limpio:

```powershell
# Lanzar Claude Code con el plugin del clon limpio (lo ejecutas por ítem,
# ajustando el entorno previo según corresponda).
claude --plugin-dir $PLUGIN_E2E
```

- **(A) Las cinco superficies de narración en modo `local` (sin claves):**
  1. En la sesión de PowerShell previa a `claude` (sin definir claves), fija el modo y confirma:
     ```powershell
     narrate-ctl mode local
     narrate-ctl status        # enabled: true, messageMode: local
     ```
     Si el daemon no está `running`: `tts-sidecar daemon start`.
  2. En la sesión de Claude, dispara **cada una** de las cinco superficies y confirma **por audible** que suena una locución corta en español, con el texto **limpio** (sin markdown, sin bloques de código ni URLs — los elimina `sanitize`), reproducido casi textualmente, no una paráfrasis:
     - **`UserPromptSubmit`**: envía un prompt simple (p. ej. "¿qué hora es?");
       escuchas tu entrada narrada.
     - **`Stop`**: el asistente termina su turno; escuchas la respuesta narrada.
     - **`SubagentStop`**: lanza un subagente que concluya (p. ej. una tarea con
       el agente `general-purpose`); escuchas su cierre.
     - **`StopFailure`**: fuerza un fallo de turno (p. ej. una tool que error o
       un bloqueo); escuchas la narración del fallo.
     - **`Notification`**: deja una petición de permiso en espera sin aprobarla
       de inmediato; escuchas la locución de notificación.
  3. **Comprobación audible:** para las cinco, el texto narrado es el del evento
     **limpio**, casi textual. Para no depender del hook puedes forzar una
     locución con `narrate-ctl say "<texto>"` desde PowerShell, pero el objetivo
     es confirmar que **cada hook** dispara por su cuenta.

- **(B) Las superficies clave en modo `llm` (con clave de proveedor):**
  1. Define la clave **en el entorno de la sesión de PowerShell** (tiene precedencia sobre `config.json` y evita escribirla en el chat); o edítala en `config.json` del state dir. **Sin clave, `llm` degrada a `local`**, así que la clave es obligatoria para este ítem.
     ```powershell
     $env:GEMINI_API_KEY = "<tu-clave-gemini>"        # o $env:OPENROUTER_API_KEY
     ```
  2. Fija el modo y confirma que la clave se ve como "configurada" (nunca su valor):
     ```powershell
     narrate-ctl mode llm
     narrate-ctl status        # gemini key: configurada  (o openrouter: configurada)
     ```
  3. Lanza Claude desde esa misma sesión de PowerShell (`claude --plugin-dir $PLUGIN_E2E`) y repite `UserPromptSubmit`, `Stop` y `SubagentStop` terminando turnos normales.
  4. **Comprobación audible:** la locución suena **parafraseada** (cadena LLM, más elaborada), no el eco limpio del evento. Como `worker.log` no registra qué proveedor corrió, la distinción `local`↔`llm` se confirma **por audible**: si escuchas una paráfrasis, el proveedor se usó; si escuchas el texto casi textual, cayó a `local` (revisa la clave). Verifica `UserPromptSubmit` (ruta prompt), `Stop` (ruta summary) y `SubagentStop` (ruta summary con su propio texto de asistente) en `llm`; `StopFailure` y `Notification` ya se cubrieron en limpio en el ítem (A): `StopFailure` comparte la rama summary de `Stop` (redundante salvo sospecha de bug) y `Notification` no usa LLM por diseño (ver más abajo), así que no tienen paráfrasis que verificar.
  5. Diagnóstico si no suena o suena como `local`:
     ```powershell
     Get-Content "$STATE_DIR\worker.log" -Tail 30   # solo errores de narración
     ```

- **(C) `narrate-ctl status` no expone claves:**
  1. Ejecuta `narrate-ctl status` con y sin clave de proveedor definida:
     ```powershell
     $env:GEMINI_API_KEY = "<tu-clave-gemini>"
     narrate-ctl status        # muestra "configurada", NO el valor
     Remove-Item Env:\GEMINI_API_KEY
     narrate-ctl status        # muestra "ausente"
     ```
  2. **Comprobación:** la salida muestra `enabled`, `messageMode`, `gemini key:
     configurada|ausente`, `openrouter: configurada|ausente`, `config:` y
     `state dir:`, pero **nunca** el valor de `GEMINI_API_KEY` /
     `OPENROUTER_API_KEY` ni de `config.json`.

- **(D) Aviso de `SessionStart` sin motor en el `PATH`:**
  1. Quita el directorio del binario del `PATH` para la sesión (degradación
     silenciosa; no borres nada):
     ```powershell
     $env:PATH = ($env:PATH -split ';' | Where-Object {
       $_ -and ($_ -notmatch 'tts-sidecar') } ) -join ';'
     # Comprobación: el binario ya no resuelve en esta sesión.
     try { tts-sidecar version } catch { "PATH recortado: tts-sidecar ausente" }
     ```
  2. Abre una sesión nueva de Claude (`claude --plugin-dir $PLUGIN_E2E`) desde
     esa sesión de PowerShell con `PATH` recortado. Debe aparecer el aviso de que
     falta el CLI/modelo **y la sesión no se bloquea**: puedes seguir trabajando.
  3. **Comprobación:** el aviso se muestra al iniciar y la sesión queda usable
     (degradación silenciosa). Restaura el `PATH` para los ítems siguientes:
     ```powershell
     $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") +
                 ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
     ```

Esta fase requiere verificación humana (audible) y no se automatiza por completo; es la única que el usuario ejecuta personalmente. La porción no audible (que `narrate-ctl status` no filtra claves y que `health-check` avisa sin bloquear) ya quedó pre-verificada en local; ver [`RELEASE-READINESS.md`](RELEASE-READINESS.md).

### Fase 3 — Cortar el release del plugin ⏳ pendiente

Una vez confirmado el smoke test de la Fase 2, se ejecuta el [Checklist de release](#checklist-de-release) completo con los números de este lanzamiento. Se corre en el **árbol de desarrollo** (no en el clon del E2E), de modo que el `dist/` commiteado sea el que resuelve el marketplace.

1. **Confirmar la versión mínima del motor** declarada en el README
   («Prerequisitos») y en [`docs/INTEGRATION.md`](INTEGRATION.md) («Requisitos
   sobre el motor»): debe ser `v0.7.7`, la verificada en la Fase 2.
   ```powershell
   Select-String -Path "$PLUGIN_DEV\README.md","$PLUGIN_DEV\docs\INTEGRATION.md" `
     -Pattern "v0\.7\.7"
   # Comprobación: ambos archivos muestran la referencia a v0.7.7.
   ```
2. **Bump de versión doble** a `0.1.0` en `package.json` **y**
   `.claude-plugin/plugin.json` (los dos números deben coincidir).
   ```powershell
   $V = "0.1.0"
   (Get-Content "$PLUGIN_DEV\package.json") `
     -replace '(?<="version":\s*")[^"]+', $V | Set-Content "$PLUGIN_DEV\package.json"
   (Get-Content "$PLUGIN_DEV\.claude-plugin\plugin.json") `
     -replace '(?<="version":\s*")[^"]+', $V | Set-Content "$PLUGIN_DEV\.claude-plugin\plugin.json"
   # Comprobación: ambos archivos reportan 0.1.0 y coinciden.
   Select-String -Path "$PLUGIN_DEV\package.json","$PLUGIN_DEV\.claude-plugin\plugin.json" `
     -Pattern '"version"'
   ```
3. **Cortar el changelog**: renombrar `## [Unreleased]` a
   `## [0.1.0] — 2026-07-17` dejando declarada la verificación contra
   TTS-Sidecar v0.7.7, crear una nueva `## [Unreleased]` vacía encima y
   actualizar las referencias de enlaces del pie. Edítalo en
   `$PLUGIN_DEV\CHANGELOG.md`.
4. **Regenerar y verificar `dist/`**, y commitearlo junto con el bump:
   ```powershell
   Push-Location $PLUGIN_DEV
   npm run build          # recompila src/ -> dist/
   npm run check-dist     # obligatorio: dist/ debe coincidir con src/
   npm run typecheck
   npm test
   Pop-Location
   # Comprobación: los cuatro comandos terminan sin error y `git status`
   # muestra dist/ modificado (debe commitearse).
   git -C $PLUGIN_DEV status --short
   ```
5. **Verificar las referencias cruzadas** con el motor
   (`docs/NARRATION-INTEGRATION.md` y `docs/CLAUDE-CODE-PLUGIN.md`, del lado del
   motor; README y `docs/INTEGRATION.md` del lado del plugin):
   ```powershell
   # Lado del plugin: las cuatro referencias apuntan a v0.7.7 / sin contradicción.
   Select-String -Path "$PLUGIN_DEV\README.md","$PLUGIN_DEV\docs\INTEGRATION.md" `
     -Pattern "v0\.7\.7"
   # Lado del motor (si el repo del motor está clonado en $ENGINE_ROOT):
   #   Get-Content "$ENGINE_ROOT\docs\NARRATION-INTEGRATION.md" -Tail 40
   # Comprobación: ninguna referencia contradice el tag v0.7.7.
   ```
6. **Commit, tag y push** — punto de no retorno, a partir del cual el
   marketplace resuelve exactamente ese estado:
   ```powershell
   Push-Location $PLUGIN_DEV
   git add -A
   git commit -m "release: v0.1.0"
   git tag v0.1.0
   git push origin main v0.1.0
   Pop-Location
   # Comprobación: el tag existe local y remotamente.
   git -C $PLUGIN_DEV tag --list v0.1.0
   git -C $PLUGIN_DEV ls-remote --tags origin v0.1.0
   ```

### Fase 4 — Verificación posterior al corte ⏳ pendiente

Los pasos de [Después del tag](#después-del-tag), ejecutados sobre el tag ya publicado:

1. **Resolución desde una máquina limpia**: en una instalación de Claude Code
   sin este plugin, resolver e instalar exactamente `v0.1.0` (el estado del tag,
   no la punta de `main`). Los dos primeros son **comandos de Claude Code**
   (dentro de una sesión), el tercero es la comprobación desde PowerShell:
   ```text
   /plugin marketplace add CristianRojas-SoftwareEngineer/tts-sidecar-narrator
   /plugin install tts-sidecar-narrator@tts-sidecar-narrator
   ```
   ```powershell
   # Comprobación: el tag v0.1.0 está publicado (es lo que el marketplace resuelve).
   git ls-remote --tags https://github.com/CristianRojas-SoftwareEngineer/tts-sidecar-narrator v0.1.0
   #     Debe listar la línea del tag refs/tags/v0.1.0.
   ```
   Tras `/plugin install`, verifica en la UI de plugins que la versión instalada
   es `0.1.0`.
2. **Enlace desde el motor**: si la entrada del `CHANGELOG.md` del motor
   menciona la disponibilidad del plugin, confirmar que el enlace apunta al tag
   correcto.
   ```powershell
   # Con el repo del motor clonado en $ENGINE_ROOT:
   Select-String -Path "$ENGINE_ROOT\CHANGELOG.md" -Pattern "tts-sidecar-narrator"
   # Comprobación: si hay mención, el enlace apunta a v0.1.0 (no a main ni a otro tag).
   ```
3. **Cierre del registro vivo**: decidir si `docs/RELEASE-READINESS.md` se
   archiva o se convierte en el roadmap de la versión siguiente y —una vez
   rodado el proceso— archivar este runbook.
   ```powershell
   # Ejemplo, si se decide archivar el registro vivo:
   git -C $PLUGIN_DEV mv docs/RELEASE-READINESS.md docs/archive/RELEASE-READINESS-v0.1.0.md
   ```
