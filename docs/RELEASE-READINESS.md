# Preparación del primer release, sincronizado con TTS-Sidecar

Este documento registra **todo lo necesario** para cortar el primer release
público de `tts-sidecar-narrator`, **lanzado en conjunto con el primer release
público de su proyecto hermano**,
[TTS-Sidecar](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar).
Cada proyecto conserva su control de versiones independiente, propio de la
historia de desarrollo de cada uno: lo que se sincroniza es el **lanzamiento**,
no los números de versión. La vara de preparación es que el plugin llegue a ese
lanzamiento con una cobertura de tests y documentación **equiparable** a la del
motor — equiparable respecto de la superficie propia de cada proyecto, no en
cantidad (ver la primera sección).

Es el registro vivo del estado de preparación (el análogo, a escala de plugin,
del `docs/ROADMAP.md` del motor): cada sección describe una brecha, su
justificación y la decisión recomendada. Una vez cortado el release, este
documento se archiva o se convierte en el roadmap de la versión siguiente.

## Tabla de contenidos

- [Qué significa «equiparable»](#qué-significa-equiparable)
- [Estado actual](#estado-actual)
- [Testing](#testing)
- [CI (y por qué no CD)](#ci-y-por-qué-no-cd)
- [Documentación](#documentación)
- [Sincronización con el release de TTS-Sidecar](#sincronización-con-el-release-de-tts-sidecar)
- [Versionado](#versionado)
- [Checklist consolidado del release](#checklist-consolidado-del-release)
- [Gestión de API keys — nota de transparencia](#gestión-de-api-keys--nota-de-transparencia)

## Qué significa «equiparable»

TTS-Sidecar tiene 572 tests pytest, CI multiplataforma con publicación
automática y una docena de documentos en `docs/`. **Equiparable no significa
igualar esos números ni replicar sus documentos**: el motor empaqueta binarios
PyInstaller para 4 plataformas, publica a PyPI y mantiene instaladores por SO;
el plugin es un cliente delgado de ~17 módulos TypeScript que se distribuye
clonando el repo. Equiparable se mide contra la superficie **propia** de cada
proyecto, en dos dimensiones: **cobertura** (de tests y de documentación sobre
lo que el plugin realmente hace y arriesga) y **completitud para su primer
release** (que no falte ninguna de las categorías que hacen a un proyecto
publicable). En concreto:

- **Testing**: cada módulo con lógica no trivial (saneamiento, fallback de
  providers, precedencia de configuración, resolución multiplataforma) tiene
  tests que ejercitan sus casos borde. Los adaptadores delgados tienen al menos
  un test de contrato.
- **CI**: ninguna verificación de correctitud depende de la disciplina manual
  del autor.
- **Documentación**: las mismas categorías que el motor cubre para su usuario
  (política de seguridad con modelo de amenaza, changelog, proceso de release
  documentado), escritas para la superficie del plugin. No se replican
  `GOAL.md`/`ROADMAP.md` como archivos separados: a esta escala, este documento
  cumple ese rol.

## Estado actual

Lo que ya existe y está en buen estado:

- README, `docs/INTEGRATION.md`, `commands/install.md` y `skills/narrate/SKILL.md`
  documentan instalación, configuración, privacidad y el contrato con el motor.
- `docs/INTEGRATION.md` ya declara el contrato con el motor (solo CLI pública)
  y tiene contraparte en el repo del motor
  ([`docs/NARRATION-INTEGRATION.md`](https://github.com/CristianRojas-SoftwareEngineer/TTS-Sidecar/blob/main/docs/NARRATION-INTEGRATION.md)).
- `npm run typecheck` y `npm run check-dist` dan una señal mínima de correctitud
  (tipos + `dist/` sincronizado con `src/`), pero hoy son manuales.
- Diseño de configuración/claves ya sigue buenas prácticas (ver la última
  sección de este documento).
- Licencia (GPL-3.0-or-later) y atribución de autoría presentes.

Lo que falta se agrupa en cuatro brechas: **cero tests**, **cero CI**,
**documentación de release/seguridad incompleta**, y **sincronización con el
motor sin definir** (ni versión mínima declarada del CLI, ni tag propio — el
repo sigue en `0.1.0` sin tags).

## Testing

No existe ningún archivo de test en el repo. Para un plugin que orquesta hooks,
un worker desacoplado y una cadena de providers LLM externos, el riesgo de una
regresión silenciosa es real: un cambio en `provider-chain.ts` o `sanitize.ts`
podría filtrar contenido no saneado a un tercero, o romper el fallback
Gemini → OpenRouter → local sin que nada lo detecte hasta producción.

**Decisión de framework**: el corredor nativo de Node (`node --test`), sin
dependencia nueva. Está alineado con el principio del plugin de no exigir
runtime extra (README, «Sin prerequisitos de runtime»), el proyecto ya compila
con `esbuild` y los tests pueden correr sobre el output compilado o vía
`tsx`/compilación previa sin agregar un framework. Vitest/Jest quedan
descartados salvo que el volumen de tests haga que su DX pague la dependencia.

Priorización, de mayor a menor retorno por esfuerzo (lo puro y determinista
primero; lo que requiere mocks de red o de sistema de archivos después):

| Módulo | Qué testear | Por qué es prioritario |
|--------|-------------|-------------------------|
| `src/message/sanitize.ts` | Que el saneamiento efectivamente quita lo que dice quitar (markdown, rutas, bloques de código) antes de narrar o de enviar a un LLM externo | Es la única barrera antes de que texto de la sesión salga hacia un tercero en modo `llm` |
| `src/message/local-builder.ts` | Casos borde de construcción determinista del mensaje local (input vacío, muy largo, sin contexto) | Es el modo de degradación por defecto (offline); si se rompe, se rompe la narración para todo usuario sin claves configuradas |
| `src/message/provider-chain.ts` | Orden de fallback Gemini → OpenRouter → local; que un fallo de un provider (429, timeout, HTTP error) cae al siguiente y no se propaga | Es el corazón del «costo cero con degradación local»; un bug aquí puede dejar la narración muda o filtrar errores al usuario |
| `src/lib/config.ts` | Precedencia env var > archivo > defaults; `emptyToUndef` con strings vacíos/whitespace; que `updateConfig` hace merge parcial y no pisa claves no tocadas | Es donde viven las credenciales; un bug de precedencia podría usar una clave vieja o ignorar una nueva sin aviso |
| `src/lib/hook-payload.ts` | Parseo del JSON que entrega Claude Code por stdin: payload bien formado, campos faltantes, JSON inválido → el hook degrada en silencio y nunca rompe la sesión | Es la puerta de entrada de todo el plugin y procesa input que el plugin no controla; un throw aquí interrumpe al usuario en cada turno |
| `src/lib/state-dir.ts` | Resolución del state dir en los tres SO (Windows/`%LOCALAPPDATA%`, Linux/XDG, macOS/`Application Support`), incluyendo env vars ausentes | Tres ramas por SO de las que dos nunca se ejecutan en la máquina de desarrollo; es el prerequisito de config y credenciales |
| `src/lib/resolve-cli.ts` | Resolución del binario `tts-sidecar` en `PATH` respetando `PATHEXT` en Windows; caso «no está» | Superficie multiplataforma con lógica condicional por SO, fácil de romper sin notar en una sola plataforma de desarrollo |
| `src/message/gemini-provider.ts` / `openrouter-provider.ts` | Con `fetch` mockeado: parseo de la respuesta, manejo de HTTP no-ok, respuesta vacía → error | Adaptadores delgados; basta un test de contrato por provider con `fetch` mockeado (Node ≥ 18 lo permite sin red real) |
| `src/narrate-ctl.ts` | Cada subcomando (`on`/`off`/`mode`/`status`/`say`) con `config.ts` real sobre un state dir temporal; que `status` jamás imprime el valor de una clave | Es la superficie que invoca la skill; el test de `status` además fija por contrato la garantía de no-exposición de credenciales |

Los módulos que quedan fuera a propósito: `narrate-hook.ts`, `narrate-worker.ts`,
`daemon.ts` y `spawn.ts` son orquestación de procesos cuyo test unitario exigiría
mockear `child_process` completo con poco retorno; su verificación queda cubierta
por el smoke test manual pre-release (ver checklist) y por los tests de las
piezas puras que orquestan.

## CI (y por qué no CD)

No existe ningún workflow (`.github/workflows` no existe). Hoy `typecheck`,
`build` y `check-dist` son responsabilidad manual del autor antes de cada
commit.

**Por qué el CI es necesario aquí y no solo deseable**: el plugin se distribuye
con `dist/` commiteado — el artefacto que ejecutan los usuarios es el que está
en git, no el que produce un build local. Eso crea un modo de fallo silencioso
que no existe en proyectos que publican a un registry: editar `src/`, olvidar
`npm run build`, commitear, y todos los usuarios ejecutan código viejo mientras
el fuente dice otra cosa. `check-dist` detecta exactamente eso, pero el paso
que se olvida (correr el build) es el mismo que se olvidaría al correr el
check. Un guard manual no protege contra el olvido que lo motiva; uno
automático sí.

**Recomendación**: **CircleCI, el mismo proveedor que TTS-Sidecar**, para que
ambos repos compartan plataforma, convenciones y experiencia operativa (el
know-how de mantener el `.circleci/config.yml` del motor aplica directo). Un
workflow con tres jobs de test espejando la nomenclatura del motor —
`test-linux` (Docker `cimg/node`), `test-windows` (orb `win/server-2022`) y
`test-macos` (executor macOS, mismo que ya usa el motor) — que corran
`npm ci && npm run typecheck && npm run check-dist && npm test`. La triple
puerta por SO es la única forma realista de ejercitar las ramas por SO de
`state-dir.ts` y `resolve-cli.ts` sin tener esas máquinas. No requiere
secretos: los tests de providers mockean `fetch`, nunca llaman a las APIs
reales.

**Diferencia deliberada con el pipeline del motor — el disparador**: el
CircleCI de TTS-Sidecar corre **solo en tags `v*`** (todos sus jobs declaran
`branches: ignore`) porque su pipeline existe para construir y publicar
artefactos (4 builds nativos + PyPI). El plugin no publica artefactos — su
«build» ya vive commiteado — así que su workflow invierte el filtro: corre **en
cada push/PR a `main`** como verificación continua, y no necesita jobs de
build ni de publicación. Por lo mismo, **CD queda fuera de alcance**: no hay
registry ni pipeline de despliegue que automatizar; el release es un tag de
git precedido por un checklist manual, y eso se documenta en
`docs/RELEASING.md` (ver siguiente sección), no se automatiza.

## Documentación

Comparado con la cobertura documental del motor (`SECURITY.md`, `CHANGELOG.md`,
`docs/RELEASING.md`, `docs/GOAL.md`/`ROADMAP.md`), al plugin le faltan tres
piezas — y una decisión explícita de no replicar una cuarta:

- **`SECURITY.md`** en la raíz, espejo estructural del del motor (versiones
  soportadas, canal privado de reporte vía GitHub Security Advisories, modelo
  de amenaza). El modelo de amenaza del plugin es distinto al del motor y hoy
  vive repartido entre README, `commands/install.md` y `skills/narrate/SKILL.md`
  — cada uno repite la parte que necesita para guiar al agente, lo cual está
  bien para esos documentos, pero no hay un lugar único que declare completo:
  - qué se persiste, dónde y con qué permisos (`config.json`, `0600` en POSIX);
  - qué protege realmente en Windows, donde `0600` es no-op (las ACL por
    defecto del perfil sobre `%LOCALAPPDATA%` — hoy eso es un comentario en el
    código, no algo que el usuario pueda leer);
  - qué sale hacia terceros y bajo qué opt-in (solo en modo `llm`, solo texto
    saneado por `sanitize.ts`, hacia Gemini/OpenRouter);
  - qué **no** hace el plugin (no pide claves en el chat, no las imprime en
    `status`, no manda nada a la red en modo `local`).
- **`CHANGELOG.md`**: con el mismo formato que el motor (Keep a Changelog +
  Versionado Semántico, en español), empezando con la sección de la primera
  versión etiquetada. La entrada inicial debe enlazar la versión del motor con
  la que se sincroniza el release (ver siguiente sección).
- **`docs/RELEASING.md`**: el proceso de release del plugin es más simple que
  el del motor (sin CI de publicación, sin artefactos, sin PyPI) pero tiene
  pasos propios que hoy son tribal knowledge y deben quedar escritos:
  - bump de versión en **dos** archivos que deben coincidir: `package.json` y
    `.claude-plugin/plugin.json`;
  - corte de la sección del `CHANGELOG.md`;
  - `npm run build && npm run check-dist` y commit del `dist/` resultante;
  - verificación de la versión mínima del motor declarada (ver siguiente
    sección);
  - smoke test manual: instalar el plugin desde el clon limpio en una sesión
    real de Claude Code con el motor en la versión sincronizada, y verificar
    narración en modo `local` y modo `llm`;
  - tag `vX.Y.Z` y push del tag; qué resuelve el marketplace de plugins a
    partir del tag.
- **Decisión: no replicar `GOAL.md`/`ROADMAP.md`.** A la escala del plugin, la
  especificación ideal ya está en el README y `docs/INTEGRATION.md`, y el
  registro vivo de estado es este documento. Crear los dos archivos del patrón
  del motor duplicaría contenido sin masa crítica que lo justifique; si el
  plugin crece hasta tener un backlog real multiversión, se adopta el patrón
  completo entonces.

## Sincronización con el release de TTS-Sidecar

Lo que se sincroniza es el **lanzamiento público conjunto**: el primer release
público de cada proyecto sale a la vez, pero cada uno con el número que le
corresponde según su propia historia de desarrollo — los ciclos de vida y el
versionado son independientes por diseño (`docs/INTEGRATION.md`, «Estabilidad
del contrato»). Que el motor llegue al lanzamiento con varios tags `0.x`
acumulados y el plugin con su primer tag no es una asimetría a corregir en este
lanzamiento: es el reflejo fiel de cuánto desarrollo lleva cada uno, y solo
convergerá cuando el motor alcance `v1.0.0` (ver
[Versionado](#versionado)). Sincronizar significa coordinar el corte y
verificar el contrato entre las dos versiones publicadas. Concretamente:

- **Versión mínima del motor declarada**: el plugin debe declarar en
  `docs/INTEGRATION.md` («Requisitos sobre el motor») y en el README **contra
  qué versión mínima del CLI `tts-sidecar` fue verificado** (la que el motor
  etiquete en el release sincronizado). Hoy el requisito está descrito
  cualitativamente (qué comandos y flags usa) pero sin número. Opcionalmente,
  `health-check` puede consultar `tts-sidecar --version` y avisar — no
  bloquear — si el motor es más viejo que la versión verificada; la degradación
  silenciosa sigue siendo el comportamiento base.
- **Orden de corte**: primero el motor, después el plugin. El release del
  motor es automático al pushear su tag (CircleCI publica binarios y PyPI); el
  del plugin es manual. La secuencia correcta es: (1) el motor corta su tag y
  su pipeline publica; (2) se instala el motor **desde los artefactos
  publicados** (no desde el árbol de desarrollo) y se corre el smoke test del
  plugin contra esa instalación; (3) recién entonces se corta el tag del
  plugin. Esto garantiza que lo que el plugin declara compatible es lo que un
  usuario real puede instalar, no un estado intermedio de `main` del motor.
- **Referencias cruzadas actualizadas en ambos repos**: el motor referencia al
  plugin en `docs/NARRATION-INTEGRATION.md` y `docs/CLAUDE-CODE-PLUGIN.md`; el
  plugin referencia al motor en `docs/INTEGRATION.md` y el README. Ambos lados
  deben apuntar a las versiones etiquetadas (o al menos no contradecirlas) al
  momento del corte. El checklist de release del motor no conoce al plugin —
  la responsabilidad de esta verificación cruzada vive en el
  `docs/RELEASING.md` del plugin.
- **Changelogs enlazados**: la entrada del `CHANGELOG.md` del plugin nombra la
  versión del motor contra la que se verificó; idealmente la entrada del motor
  menciona la disponibilidad del plugin.

## Versionado

El repo sigue en `0.1.0` sin tags; el motor va en `v0.7.2`. Esa disparidad es
correcta y esperada: cada número refleja la historia de desarrollo de su
proyecto, y así seguirá siendo después del lanzamiento conjunto.
Recomendación para el primer tag del plugin: **`v0.1.0`**, no `v1.0.0` — el
motor comunica estado pre-1.0 y el plugin, que existe hace menos y tiene menos
rodaje, no debería comunicar más estabilidad que su dependencia. Lo que une a
ambos proyectos es la declaración explícita de compatibilidad de la sección
anterior, no el número de versión.

**Convergencia planificada en v1.0.0**: la disparidad de números es temporal
por decisión, no por accidente. Durante el tramo pre-1.0 el plugin publica sus
propias versiones intermedias (`v0.2.0`, `v0.3.0`, …) al ritmo que dicten sus
correcciones y mejoras, sin relación con los números del motor. Cuando
TTS-Sidecar alcance su `v1.0.0`, el plugin **avanzará desde la versión que
haya alcanzado hasta ese momento directamente a `v1.0.0`**, en un release que
acumule las correcciones implementadas hasta entonces. A partir de ese punto
ambos proyectos comunican madurez estable con el mismo número mayor. Este plan
debe quedar registrado también en el `CHANGELOG.md` del plugin (nota en la
entrada inicial) para que ese salto final de numeración (de la `0.x` alcanzada
a `1.0.0`) tenga explicación pública y no parezca un error de versionado.

El tag se corta una vez cerradas las brechas de testing/CI/documentación de
arriba, para que el marketplace resuelva una versión fija en vez de la punta de
`main`.

## Checklist consolidado del release

El orden importa: cada bloque habilita al siguiente.

1. **Testing** — suite `node --test` cubriendo la tabla de priorización
   (mínimo: `sanitize`, `local-builder`, `provider-chain`, `config`,
   `hook-payload`, `state-dir`, `resolve-cli`); script `npm test` en
   `package.json`.
2. **CI** — workflow de CircleCI en push/PR a `main` con la triple puerta
   `test-linux`/`test-windows`/`test-macos` (misma nomenclatura que el motor):
   `npm ci && npm run typecheck && npm run check-dist && npm test`, en verde.
3. **Documentación** — `SECURITY.md` (con la nota de Windows/ACL),
   `CHANGELOG.md` (Keep a Changelog, sección `[0.1.0]` cortada) y
   `docs/RELEASING.md` escritos; versión mínima del motor declarada en
   `docs/INTEGRATION.md` y README.
4. **Sincronización** — el motor corta su release; smoke test del plugin
   contra el motor **instalado desde los artefactos publicados**, en modo
   `local` y `llm`; referencias cruzadas de ambos repos verificadas.
5. **Corte** — bump `0.1.0` confirmado en `package.json` **y**
   `.claude-plugin/plugin.json`, `dist/` regenerado y `check-dist` en verde,
   tag `v0.1.0`, push del tag.
6. **Post-corte** — este documento se archiva o se convierte en el roadmap de
   la siguiente versión.

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
código, no algo que el usuario pueda leer. La resolución de esta brecha queda
absorbida por el `SECURITY.md` de la sección [Documentación](#documentación):
una frase explícita en su modelo de amenaza, y opcionalmente una advertencia en
el `status` o en el README de que en Windows la protección depende de las ACL
del perfil, no de un permiso de archivo explícito.
