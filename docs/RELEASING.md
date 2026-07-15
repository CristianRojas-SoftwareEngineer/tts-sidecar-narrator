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

- [Modelo de versionado](#modelo-de-versionado)
- [Prerequisitos del corte](#prerequisitos-del-corte)
- [Checklist de release](#checklist-de-release)
- [Sincronización con un release del motor](#sincronización-con-un-release-del-motor)
- [Después del tag](#después-del-tag)

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
   plugin en `docs/NARRATION-INTEGRATION.md` y `docs/CLAUDE-CODE-PLUGIN.md`;
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
