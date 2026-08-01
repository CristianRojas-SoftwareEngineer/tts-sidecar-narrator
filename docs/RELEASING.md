# Proceso de release

Cómo se corta y publica una versión de `tts-sidecar-narrator`. El proceso es deliberadamente más simple que el del motor ([TTS-Sidecar/docs/RELEASING.md](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/blob/main/docs/RELEASING.md)): aquí no hay CI de publicación, artefactos nativos ni PyPI — el plugin se distribuye clonando el repo con `dist/` commiteado, y **el release es un tag de git precedido por este checklist**. El CI de CircleCI corre en cada push como verificación continua (no participa del corte); el marketplace de plugins de Claude Code resuelve las versiones desde los tags del repo.

## Tabla de contenidos

- [Modelo de versionado](#modelo-de-versionado)
- [Prerequisitos del corte](#prerequisitos-del-corte)
- [Checklist de release](#checklist-de-release)
- [Sincronización con un release del motor](#sincronización-con-un-release-del-motor)
- [Después del tag](#después-del-tag)
- [Runbook ejecutable](#runbook-ejecutable)
  - [Convenciones y variables](#convenciones-y-variables)
  - [Fase 1 — Verificar que el motor publicado es el correcto](#fase-1--verificar-que-el-motor-publicado-es-el-correcto)
  - [Fase 2 — Smoke test contra el motor publicado](#fase-2--smoke-test-contra-el-motor-publicado)
  - [Fase 3 — Cortar el release del plugin](#fase-3--cortar-el-release-del-plugin)
  - [Fase 4 — Verificación posterior al corte](#fase-4--verificación-posterior-al-corte)

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
3. **Verificar `dist/`** (el pre-commit hook lo regenera automáticamente al commitear):
   ```bash
   npm run check-dist
   npm run typecheck
   npm test
   ```
   `check-dist` en verde es obligatorio: lo que ejecutan los usuarios es el `dist/` del árbol de git.
   El hook en `.githooks/pre-commit` corre `npm run build` y staggea `dist/` en cada commit, así que no
   hace falta invocarlo manualmente.
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
- Actualizar [`ROADMAP.md`](ROADMAP.md): las direcciones ya implementadas o
  descartadas se mueven al histórico; las nuevas que surjan del release se
  incorporan a la sección correspondiente.

## Runbook ejecutable

Aplicación práctica del [Checklist de release](#checklist-de-release) de arriba: en lugar de pasos genéricos, cada fase lista los **comandos concretos** (PowerShell 7 sobre Windows 11) y la **comprobación** de cada paso.

Las fases asumen que el release del plugin **acompaña** a uno del motor. Si es un release correctivo propio (sin nuevo release del motor), las fases 1 y 2 se saltan — el smoke test se corre contra la versión del motor ya declarada como mínima.

### Convenciones y variables

Estas variables se reutilizan en varias fases; defínelas al inicio de la sesión de PowerShell. El primero en hacer el release las ajusta a su entorno:

```powershell
# Árbol de desarrollo del plugin.
$PLUGIN_DEV = (Get-Item .).FullName

# Directorio temporal para el clon limpio del E2E.
$PLUGIN_E2E = "$env:TEMP\tts-sidecar-narrator-e2e"

# State dir del plugin (Windows): %LOCALAPPDATA%\tts-sidecar-narrator.
$STATE_DIR = "$env:LOCALAPPDATA\tts-sidecar-narrator"

# Versión del motor contra la que se verificará (la publicada).
$MOTOR_VERSION = "vX.Y.Z"

# (Opcional) Árbol del repo del motor, para las comprobaciones cruzadas.
$ENGINE_ROOT = "C:\ruta\a\TTS-Sidecar"

# Atajo para invocar la CLI de control compilada.
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
  proveedor se usó; la distinción `local` vs `llm` se verifica **por audible**.

### Fase 1 — Verificar que el motor publicado es el correcto

El plugin se verifica contra la **última versión publicada del motor**, no contra su árbol de desarrollo (regla «primero el motor, después el plugin»). Esta fase confirma que el release del motor ya está disponible públicamente.

```powershell
# 1a. El GitHub Release expone los assets esperados.
gh release view $MOTOR_VERSION --repo CristianRojas-SoftwareEngineer/TTS-Sidecar

# 1b. PyPI confirma la versión como publicada.
pip index versions tts-sidecar

# Comprobación: la versión $MOTOR_VERSION figura como la más reciente
# en ambos canales (GitHub Releases y PyPI).
```

### Fase 2 — Smoke test contra el motor publicado

Corresponde al paso 6 del [Checklist de release](#checklist-de-release). Es un **E2E audible en Windows 11 (PowerShell 7)**: quien corta el release lo ejecuta personalmente.

#### Paso 1 — Instalar y aprovisionar el motor publicado

```powershell
# 1a. Instalar el motor fijando la versión verificada (uv tool es opcional;
#     también sirve el instalador nativo).
uv tool install "tts-sidecar==$MOTOR_VERSION"

# 1b. Comprobación: el CLI reporta la versión correcta.
tts-sidecar version

# 1c. Aprovisionar el modelo (idempotente).
tts-sidecar setup

# 1d. Comprobación: doctor sin FAIL de modelo.
tts-sidecar doctor --json | ConvertFrom-Json |
  ForEach-Object { $_.checks } | Where-Object { $_.status -eq 'FAIL' }
#     La salida debe estar VACÍA (ningún FAIL).
```

#### Paso 2 — Dejar el daemon en marcha

```powershell
tts-sidecar daemon start
# Comprobación: el daemon queda running.
tts-sidecar daemon status --json | ConvertFrom-Json | ForEach-Object { $_.running }
#     Debe imprimir: True
```

#### Paso 3 — Clonar el plugin en un directorio limpio

No uses el árbol de desarrollo para el E2E: clona una copia fresca.

```powershell
if (-not (Test-Path $PLUGIN_E2E)) {
  git clone https://github.com/CristianRojas-SoftwareEngineer/tts-sidecar-narrator $PLUGIN_E2E
}
# Comprobación: el dist/ compilado existe (es lo que ejecutan los hooks).
Test-Path "$PLUGIN_E2E\dist\narrate-ctl.js"
```

#### Paso 4 — Comprobación base (sin sesión de Claude)

Valida el pipeline TTS + daemon de forma aislada. No requiere claves.

```powershell
narrate-ctl on                        # activa la narración
narrate-ctl mode local                # modo local (determinista, offline)
narrate-ctl status                    # enabled: true, messageMode: local
tts-sidecar daemon status --json | ConvertFrom-Json | ForEach-Object { $_.running }
narrate-ctl say "Prueba de audio local"
# Comprobación AUDIBLE: se escucha la frase en español.
```

#### Paso 5 — Verificación completa por superficie del contrato (audible)

Cada ítem deja el entorno en la condición indicada, dispara la narración y **escucha** el resultado. El plugin registra **cinco hooks de narración** (todos vía `dist/narrate-hook.js`, ver `hooks/hooks.json`): `UserPromptSubmit`, `Stop`, `SubagentStop`, `StopFailure` y `Notification`. Solo `Stop` cambia entre modos (única ruta dinámica que enruta al LLM); las otras cuatro superficies reproducen siempre su aviso pre-sintetizado, en `local` y en `llm` por igual. El smoke test debe ejercitar **las cinco** en modo `local` y, en `llm`, confirmar que `Stop` se oye distinto (parafraseado) y que el resto suena idéntico a `local`.

```powershell
# Lanzar Claude Code con el plugin del clon limpio (se abre por ítem).
claude --plugin-dir $PLUGIN_E2E
```

- **(A) Las cinco superficies en modo `local` (sin claves):**
  1. Antes de `claude`, sin claves definidas:
     ```powershell
     narrate-ctl mode local
     narrate-ctl status
     ```
  2. En la sesión de Claude, dispara **cada una** de las cinco superficies y
     confirma **por audible** que suena una locución en español, con el texto
     **limpio** (sin markdown, sin bloques de código ni URLs), casi textual:
     - **`UserPromptSubmit`** — envía un prompt simple.
     - **`Stop`** — el asistente termina su turno.
     - **`SubagentStop`** — lanza un subagente que concluya.
     - **`StopFailure`** — fuerza un fallo de turno.
     - **`Notification`** — deja una petición de permiso en espera.
  3. **Comprobación:** para las cinco, el texto narrado es limpio y casi textual.

- **(B) Las superficies clave en modo `llm` (con clave de proveedor):**
  1. Define la clave en el entorno de la sesión de PowerShell:
     ```powershell
     $env:GEMINI_API_KEY = "<tu-clave-gemini>"
     ```
  2. Fija el modo:
     ```powershell
     narrate-ctl mode llm
     narrate-ctl status        # gemini key: configurada
     ```
  3. Lanza Claude desde esa misma sesión y dispara **`Stop`** — es la única
     superficie que enruta al LLM.
  4. **Comprobación:** la locución de `Stop` suena **parafraseada** (cadena
     LLM), distinta del resumen local determinista. `UserPromptSubmit`,
     `SubagentStop`, `StopFailure` y `Notification` no tienen paráfrasis que
     verificar: siempre reproducen su aviso pre-sintetizado, sin LLM, igual que en
     modo `local`.
  5. Diagnóstico:
     ```powershell
     Get-Content "$STATE_DIR\worker.log" -Tail 30
     ```

- **(C) `narrate-ctl status` no expone claves:**
  ```powershell
  $env:GEMINI_API_KEY = "<tu-clave-gemini>"
  narrate-ctl status        # muestra "configurada", NO el valor
  Remove-Item Env:\GEMINI_API_KEY
  narrate-ctl status        # muestra "ausente"
  ```

- **(D) Aviso de `SessionStart` sin motor en el `PATH`:**
  1. Quita el directorio del binario del `PATH` para la sesión:
     ```powershell
     $env:PATH = ($env:PATH -split ';' | Where-Object {
       $_ -and ($_ -notmatch 'tts-sidecar') } ) -join ';'
     ```
  2. Abre Claude desde esa sesión. Debe aparecer el aviso **sin bloquear** la
     sesión.
  3. Restaura el `PATH`:
     ```powershell
     $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") +
                 ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
     ```

Esta fase requiere verificación humana (audible) y no se automatiza por completo.

### Fase 3 — Cortar el release del plugin

Confirmado el smoke test de la Fase 2, se ejecuta el [Checklist de release](#checklist-de-release) completo. Se corre en el **árbol de desarrollo**.

```powershell
# 1. Confirmar la versión mínima del motor declarada en README e INTEGRATION.md.
Select-String -Path "$PLUGIN_DEV\README.md","$PLUGIN_DEV\docs\INTEGRATION.md" `
  -Pattern $MOTOR_VERSION

# 2. Bump de versión doble a X.Y.Z en package.json y .claude-plugin/plugin.json.
$V = Read-Host "Versión del plugin (ej. 0.2.0)"
(Get-Content "$PLUGIN_DEV\package.json") `
  -replace '(?<="version":\s*")[^"]+', $V | Set-Content "$PLUGIN_DEV\package.json"
(Get-Content "$PLUGIN_DEV\.claude-plugin\plugin.json") `
  -replace '(?<="version":\s*")[^"]+', $V | Set-Content "$PLUGIN_DEV\.claude-plugin\plugin.json"
Select-String -Path "$PLUGIN_DEV\package.json","$PLUGIN_DEV\.claude-plugin\plugin.json" `
  -Pattern '"version"'

# 3. Cortar el changelog: editar CHANGELOG.md manualmente.

# 4. Verificar dist/.
Push-Location $PLUGIN_DEV
npm run check-dist
npm run typecheck
npm test
Pop-Location

# 5. Verificar referencias cruzadas con el motor.
Select-String -Path "$PLUGIN_DEV\README.md","$PLUGIN_DEV\docs\INTEGRATION.md" `
  -Pattern $MOTOR_VERSION
# Lado del motor (si está clonado):
#   Get-Content "$ENGINE_ROOT\docs\NARRATION-INTEGRATION.md" -Tail 40

# 6. Commit, tag y push.
Push-Location $PLUGIN_DEV
git add -A
git commit -m "release: v$V"
git tag "v$V"
git push origin main "v$V"
Pop-Location
git tag --list "v$V"
git ls-remote --tags origin "v$V"
```

### Fase 4 — Verificación posterior al corte

```powershell
# 1. Resolución desde una máquina limpia.
#    Comandos dentro de Claude Code:
#      /plugin marketplace add CristianRojas-SoftwareEngineer/tts-sidecar-narrator
#      /plugin install tts-sidecar-narrator@tts-sidecar-narrator

# Comprobación: el tag está publicado.
git ls-remote --tags https://github.com/CristianRojas-SoftwareEngineer/tts-sidecar-narrator "v$V"

# 2. Si el changelog del motor menciona el plugin, confirmar que el enlace
#    apunta al tag correcto.
Select-String -Path "$ENGINE_ROOT\CHANGELOG.md" -Pattern "tts-sidecar-narrator"

# 3. Actualizar ROADMAP.md con las direcciones cerradas y las que surjan
#    de este release.
```
