# Migración de integración: TTS-Sidecar v0.8.0 → v0.9.1

Este documento explica los cambios de la **CLI de TTS-Sidecar** entre la versión
contra la que `tts-sidecar-narrator` quedó integrado por última vez (**v0.8.0**) y
el estado actual del motor (**tag `v0.9.1`**, HEAD `3402bb8`), y deriva de ellos
las **correcciones de integración concretas** a implementar en el plugin.

> Alcance de este documento: **explicar y señalar**. No implementa las
> correcciones; las lista para ejecutarlas en un cambio posterior.

## Tabla de contenidos

- [Versiones en juego](#versiones-en-juego)
- [Qué cambió en la CLI (v0.8.0 → v0.9.1)](#qué-cambió-en-la-cli-v080--v091)
- [Diff por superficie del contrato](#diff-por-superficie-del-contrato)
- [Ruptura 1 — el comando `speak` ya no existe](#ruptura-1--el-comando-speak-ya-no-existe)
- [Ruptura 2 — `doctor --json` emite dos objetos JSON al fallar](#ruptura-2--doctor---json-emite-dos-objetos-json-al-fallar)
- [Contexto adicional no bloqueante](#contexto-adicional-no-bloqueante)
- [Derivas de documentación](#derivas-de-documentación)
- [Correcciones a implementar](#correcciones-a-implementar)
- [Rediseño de `UserPromptSubmit`: aviso fijo pre-sintetizado](#rediseño-de-userpromptsubmit-aviso-fijo-pre-sintetizado)
  - [El problema actual](#el-problema-actual)
  - [El cambio de especificación](#el-cambio-de-especificación)
  - [Superficies nuevas del contrato CLI](#superficies-nuevas-del-contrato-cli)
  - [Diseño de la resolución](#diseño-de-la-resolución)
  - [Impacto señalado en el plugin](#impacto-señalado-en-el-plugin)

## Versiones en juego

| | Versión | Referencia |
|---|---------|------------|
| Última integrada por el plugin | **v0.8.0** | `docs/INTEGRATION.md` §Requisitos ("versión mínima verificada: v0.8.0") |
| Estado actual del motor | **v0.9.1** (HEAD `3402bb8`) | tag vigente en PyPI + GitHub Release |
| Versión del plugin | `0.1.0` | `.claude-plugin/plugin.json` |

El salto 0.8.0 → 0.9.0 cerró el **rediseño de la CLI** del motor, y v0.9.1 corrigió
además la doble emisión JSON de `doctor`. En 0.8.0 el plugin funcionaba; el rediseño
rompió en silencio **dos de sus superficies consumidas** (detalle abajo). De ellas,
`doctor --json` **ya está sana en v0.9.1** (corregida en el motor); solo queda `speak`
por reparar en el plugin. Las rupturas son silenciosas: no producen error visible,
simplemente dejan de narrar o dejan de avisar.

## Qué cambió en la CLI (v0.8.0 → v0.9.1)

El rediseño consolidó tres cambios incompatibles:

1. **`speak` eliminado.** El comando `speak` se retiró por completo (sin alias de
   compatibilidad) y se reemplazó por dos subcomandos bajo `speech`:
   - `speech say` — sintetiza y **reproduce** (sin persistir). Equivalente directo
     del antiguo `speak`.
   - `speech synthesize` — sintetiza y **guarda** a archivo (con `--label`).
2. **Exit codes centralizados en enteros.** Los códigos de salida se movieron a
   `exit_codes.py` y `main()` es el único punto de traducción. Tabla congelada:
   `0` OK, `1` error genérico, `2` entrada inválida, `3` no encontrado, `4` modelo
   ausente, `5` daemon inalcanzable, `6` conflicto de estado, `7` no aplicable,
   `8` precondición fallida, `130` interrumpido.
3. **Clave `error` en los payloads `--json`.** Toda salida no-cero bajo `--json`
   emite ahora, además de lo que el comando ya imprimiera, un objeto de error de
   primer nivel `{"schema_version","error":{"code","reason","message"}}`. Esta
   emisión la añade `main()` al traducir la `CliError` (`cli.py:88-89`).

`schema_version` subió a `"2"` en los payloads `--json`.

En **v0.9.1**, además, `doctor --json` con FAIL dejó de emitir un segundo objeto
`{"error":{…}}`: ahora sale por **veredicto** (un solo objeto, exit `1` sin clave
`error`; ver [Ruptura 2](#ruptura-2--doctor---json-emite-dos-objetos-json-al-fallar)
y `CLI-CONTRACT.md` §10 del motor).

## Diff por superficie del contrato

El plugin consume **cuatro** superficies de la CLI. Estado en v0.9.1:

| # | Superficie (según `INTEGRATION.md`) | Consumidor en el plugin | Estado en v0.9.1 |
|---|-------------------------------------|-------------------------|------------------|
| 1 | `speak --text "<msg>" --daemon` | `src/narrate-worker.ts:95` | **ROTA** → es `speech say` |
| 2 | `doctor --json` (`checks[]`, `name=="Chatterbox model"`, `PASS`/`FAIL`) | `src/health-check.ts:48-66` | **OK desde v0.9.1** (el motor corrigió la doble emisión: un solo objeto) |
| 3 | `daemon status --json` (`running == true`) | `src/lib/daemon.ts:13-23` | **OK, sin cambios** |
| 4 | `daemon start` | `src/lib/daemon.ts:36` | **OK, sin cambios** |

Las superficies 3 y 4 siguen válidas: `daemon status` es comando de lectura (exit
`0` aun con el daemon caído → sin clave `error`, un solo objeto JSON que
`isDaemonRunning` parsea sin problema); `daemon start` no usa `--json`.

## Ruptura 1 — el comando `speak` ya no existe

**Dónde:** `src/narrate-worker.ts:92-110`, función `runSpeak`.

```ts
// línea 95, actual (roto contra v0.9.1):
const args = ["speak", "--text", text, "--daemon"];
```

En v0.9.1 `speak` no es un subcomando reconocido. La CLI sale con código `2`
(entrada inválida). Como `runSpeak` usa `stdio: "ignore"` y solo registra
`speak salió con código 2` en `worker.log` (línea 106), **la narración deja de
sonar sin ningún síntoma para el usuario**: cada turno se "narra" con un fallo
silencioso.

**Corrección:** invocar `speech say` en vez de `speak`:

```ts
const args = ["speech", "say", "--text", text, "--daemon"];
```

`speech say --text "<msg>" --daemon` es el equivalente exacto: sintetiza y
reproduce, exige el daemon (exit `5` si no está, sin autoarranque). El plugin no
lee el payload `--json` de esta superficie (usa `stdio: "ignore"` y solo mira el
exit code), así que la clave `error` nueva no le afecta aquí.

## Ruptura 2 — `doctor --json` emite dos objetos JSON al fallar

Esta ruptura es más sutil y **anula justo la función que `health-check` existe
para cumplir**: avisar de que falta el modelo.

**Dónde:** `src/health-check.ts:60`.

```ts
report = JSON.parse(res.stdout) as DoctorReport;
```

**Qué pasa en v0.9.0.** Cuando `doctor --json` detecta un FAIL (p. ej. el modelo
`es-mx-latam` no está en caché — el caso exacto que el health-check quiere
detectar), la CLI escribe en stdout **dos** objetos JSON, no uno:

1. Primero el reporte completo con `checks[]` (`cli.py:976-982`).
2. Luego, porque `doctor` lanza `CliError` con exit `1` y `main()` la traduce con
   `--json` presente, un segundo objeto `{"error":{…}}` (`cli.py:88-89`).

`JSON.parse(res.stdout)` sobre dos objetos concatenados **lanza una excepción**.
El `catch` de la línea 61 llama a `ok()` → el hook sale `0` **sin emitir el
`systemMessage`** de "modelo no descargado". Resultado: el usuario nunca recibe el
aviso que el health-check debía darle, precisamente cuando el modelo falta.

> En el camino feliz (todos los checks PASS) no hay FAIL → no hay `CliError` → un
> solo objeto JSON → `JSON.parse` funciona. Por eso el fallo solo aparece en el
> caso de error, que es el que importa.

**Corregido en el motor (v0.9.1).** La raíz se arregló en TTS-Sidecar, no en el
plugin: `doctor --json` con FAIL ahora emite **un solo objeto** (el reporte, con
`failed>0`) y sale con `1` como **salida por veredicto** —código ≠ 0 con payload
propio ya emitido y **sin** objeto `error`—, el tercer formato del canal `--json`
(ver `CLI-CONTRACT.md` §10 del motor). El `JSON.parse(res.stdout)` de la línea 60
vuelve a funcionar sin cambios en el plugin: **no** se necesita parseo tolerante.

> Se descartó la alternativa de parchear el plugin (parseo tolerante al segundo
> objeto): la doble emisión era un defecto del motor —violaba la promesa de
> `emit_json()` de un objeto por invocación— y corregirla en la raíz deja el canal
> `--json` consistente para cualquier consumidor, no solo este plugin.

## Contexto adicional no bloqueante

Estos cambios del rediseño **no rompen** al plugin hoy, pero conviene registrarlos:

- **Exit codes enteros.** El plugin no ramifica por códigos específicos:
  `runSpeak` solo compara `code !== 0`; `isDaemonRunning` lee el JSON `running`, no
  el exit; `health-check` mira `status` de `checks[]`. La renumeración no le
  afecta funcionalmente.
- **Clave `error` en `--json`.** Solo aparece en salidas no-cero. Afecta al plugin
  únicamente en la superficie 2 (ver Ruptura 2); en `daemon status --json` (exit
  `0`) no aparece.
- **`schema_version "2"`.** El plugin no valida `schema_version`, así que el
  cambio es transparente. (Nota: `cli.SCHEMA_VERSION` del payload `--json` y
  `protocol.SCHEMA_VERSION` del IPC son dos esquemas independientes, ambos `"2"`
  por causas distintas; no confundirlos.)

## Derivas de documentación

En `docs/INTEGRATION.md` del plugin:

- **Línea 6:** enlaza a `docs/NARRATION-INTEGRATION.md` del motor, pero ese
  documento se renombró a **`docs/CLAUDE-CODE-INTEGRATION.md`**. El enlace está
  roto.
- **Línea 37:** la tabla de superficies lista `speak --text "<msg>" --daemon`;
  debe ser `speech say --text "<msg>" --daemon`.
- **Líneas 44-45:** la sección "Cómo lo usan los hooks" también menciona `speak`.
- **Línea 58:** "versión mínima verificada: **v0.8.0**"; al corregir e integrar
  contra v0.9.1, actualizar a **v0.9.1**.

## Correcciones a implementar

Lista accionable derivada de lo anterior (**ejecutada**; estado final):

- [x] `src/narrate-worker.ts` — cambiado `["speak", …]` por
      `["speech", "say", "--text", text, "--daemon"]`; la función se renombró
      `runSpeak` → `runSay` con su comentario y mensajes de log. **Nota no
      registrada en el análisis original**: la ruptura de `speak` alcanzaba
      también al subcomando `say` de `src/narrate-ctl.ts:34`, corregido en el
      mismo cambio.
- [x] `src/health-check.ts:60` — **sin cambios en el plugin**: el motor v0.9.1
      corrigió la raíz (`doctor --json` FAIL emite un solo objeto), así que
      `JSON.parse(res.stdout)` funciona y el aviso de "modelo no descargado" vuelve
      a emitirse. Verificado el camino feliz contra v0.9.1 del motor (el caso FAIL
      queda cubierto por el contrato §10 del motor).
- [x] `docs/INTEGRATION.md` — corregida la superficie 1 (`speak` → `speech say`)
      en la tabla y en "Cómo lo usan los hooks", arreglado el enlace al documento
      del motor (`NARRATION-INTEGRATION.md` → `CLAUDE-CODE-INTEGRATION.md`),
      subida la versión mínima verificada a v0.9.1 y declaradas las superficies
      5 (`speech synthesize`) y 6 (`speech play`) del rediseño de
      `UserPromptSubmit`.
- [x] Verificado tras los cambios: con daemon caliente, un turno narra vía
      `speech say`; `doctor --json` parsea como un solo objeto. Sin cambios en
      `src/lib/daemon.ts` (superficies 3 y 4 intactas).

El rediseño de `UserPromptSubmit` descrito abajo también quedó **implementado**:
catálogo de avisos en `src/message/static-avisos.ts` (labels
`narrator-<sha256:12>`), subcomando `narrate-ctl bake` (idempotente, integrado
en `commands/install.md`), `runPlay` en el worker con política de fallo visible
(log y silencio, sin auto-sanación), y eliminación del modo prompt del LLM
(`buildPromptMessage`, `PROMPT_SYSTEM_PROMPT`).

## Rediseño de `UserPromptSubmit`: aviso fijo pre-sintetizado

> **Naturaleza distinta al resto del documento.** Las secciones anteriores derivan
> de **rupturas** del contrato CLI (el motor cambió y el plugin debe alinearse para
> no romperse). Esta sección **no** es una ruptura: es un **rediseño deliberado** del
> manejo del evento `UserPromptSubmit`, que además pasa a consumir superficies nuevas
> del motor (`speech synthesize`, `speech play`). Se documenta aquí —problema y
> resolución esperada— por decisión de diseño; **no se implementa**. El plan de
> ejecución se redactará en una iteración posterior sobre este documento.

### El problema actual

Hoy el hook `UserPromptSubmit` produce un mensaje **dinámico** por turno. En
`src/message/build-message.ts`, `buildPromptMessage`:

- en modo `llm` (default de `config.ts`), llama a un LLM de narración (Gemini/
  OpenRouter) para "responder" al prompt recién enviado;
- en modo `local`, resume el propio prompt del usuario;
- solo como último recurso cae al estático `"Solicitud recibida. Procesando con
  Claude."` (`src/message/local-builder.ts:9`).

Ese diseño tiene dos defectos, ambos en la ruta caliente de cada prompt:

1. **Divergencia semántica.** El LLM que narra es **independiente** del que procesará
   finalmente el prompt. La narración "acepta la tarea" con su propia interpretación,
   que no tiene por qué coincidir con lo que Claude hará después. El acuse de recibo
   puede, literalmente, describir algo distinto del trabajo real.
2. **Latencia en el peor momento.** Tras enviar el prompt, el usuario espera un
   *round-trip* al LLM de narración **más** la síntesis de voz antes de oír nada. Es
   la espera más visible de todo el ciclo, y se paga en cada turno.

### El cambio de especificación

`UserPromptSubmit` **deja de emitir un mensaje dinámico**. Pasa a reproducir un
**aviso fijo, único y pre-sintetizado** —"Procesando con Claude"— como acuse de
recibo determinista. Consecuencias de la especificación:

- Ese hook **ya no invoca ningún LLM** ni resume el prompt: no hay interpretación que
  pueda divergir, y no hay red en la ruta caliente.
- La reproducción es un `speech play` de un WAV ya horneado: **sin modelo y sin
  daemon**, es decir, prácticamente instantánea y robusta ante un daemon frío o caído.
- Los eventos **dinámicos no cambian**. Stop / SubagentStop / StopFailure resumen *lo
  que ya ocurrió* —varía de turno a turno y ese es su valor— y siguen usando
  `speech say` (síntesis efímera). El aviso fijo aplica **solo** a `UserPromptSubmit`,
  que es un acuse de inicio, no un resumen.

### Superficies nuevas del contrato CLI

El plugin consume hoy cuatro superficies (ver [Diff por superficie](#diff-por-superficie-del-contrato)).
El rediseño añade **dos**, ambas del grupo `speech` estabilizado en v0.9.x:

| Superficie | Rol | Modelo/daemon | Persiste | Códigos de salida relevantes |
|---|---|---|---|---|
| `speech synthesize -t "<aviso>" -l <label>` | Hornea el aviso una vez y lo guarda | **sí** (o `--no-daemon` para carga directa) | sí (`synthetic-speech/<voz>/<label>.wav`) | `0` ok · `6` label ya existe sin `-f` · `5` daemon caído con `--daemon` · `4` modelo no provisionado · `2` etiqueta ilegal · `3` voz inexistente |
| `speech play -l <label>` | Reproduce el aviso guardado | **no** | — | `0` existe · **`3` no existe** (cache miss) · `2` etiqueta ilegal |

Notas de contrato que condicionan el diseño:

- **`speech play` no toca el modelo ni el daemon**: por eso es el camino instantáneo
  y resiliente. Sus únicos flags son `--label/-l` (requerido), `--voice/-v` y `--json`.
- **El *cache miss* es un código limpio (`3`)**, no una excepción ambigua: es la señal
  que el plugin registra como "aviso no horneado" (la resolución del miss es manual;
  ver [Diseño de la resolución](#diseño-de-la-resolución)).
- **`speech synthesize` sí exige el modelo cargado** (con `--daemon` sale `5` si el
  daemon está caído; con `--no-daemon` carga el modelo directo). Esto obliga a hornear
  cuando el daemon ya está caliente, no en cualquier momento.
- **No hay exportación del WAV** fuera de la CLI (coste declarado en `CLI-CONTRACT.md`
  §"Coste declarado"): toda reutilización pasa por `speech play`, que es justo lo que
  el rediseño necesita.

### Diseño de la resolución

1. **Aviso fijo con label estable.** El label del aviso se deriva de un **hash del
   texto** (p. ej. `narrator-<hash>`). Así, si algún día cambia la frase del aviso, el
   nuevo texto produce un label nuevo: nunca se reproduce el WAV viejo por accidente,
   y basta repetir el paso de horneado con la frase nueva.
2. **Almacenamiento consciente de la voz.** El almacén es por voz
   (`synthetic-speech/<voz>/<label>.wav`). El plugin debe pasar `--voice` de forma
   **consistente** en `synthesize` y `play`; si el usuario cambia de voz, debe
   repetirse manualmente el paso de horneado para la voz nueva. Con la voz por defecto, ambos comandos usan `default` sin
   flag, de forma coherente.
3. **Horneado explícito, una sola vez.** El aviso se hornea con
   `speech synthesize -t "<aviso>" -l <label>` en un **paso explícito** de
   instalación/`setup` del plugin, no en la ruta caliente. Si la caché se borra o
   cambia la voz, la recuperación es **manual**: repetir ese mismo paso. En cada
   turno, el hook ejecuta únicamente `speech play`.
4. **Fallo visible, sin auto-sanación.** Si `speech play` sale con código no-cero
   —incluido el `3` de *cache miss*—, el hook **no** re-hornea ni degrada a
   `speech say`: registra el fallo en `worker.log` (o emite un warning) y ese turno
   queda sin aviso sonoro. La auto-sanación (detectar el miss y re-sintetizar en
   caliente) queda **fuera del alcance de esta versión**.

### Impacto señalado en el plugin

Puntos de contacto a tocar (se **señalan**, no se implementan aquí; entran en el plan
posterior):

- `src/narrate-hook.ts` (router de eventos) — `UserPromptSubmit` se enruta a la ruta
  del aviso fijo, **no** a `buildMessage`.
- `src/narrate-worker.ts` — además del arreglo `speak → speech say` (Ruptura 1) para
  los eventos dinámicos, añadir `runPlay(label)`; ante cualquier exit no-cero,
  registrar el fallo en `worker.log` y terminar (sin re-horneado ni fallback).
- Paso de instalación/`setup` — invocar `speech synthesize` una sola vez para hornear
  el aviso, y documentar su re-ejecución manual (borrado de caché, cambio de voz o de
  frase).
- `src/message/build-message.ts` — `UserPromptSubmit` deja de pasar por
  `buildPromptMessage`; el aviso no depende del modo `llm`/`local`.
- Registro del aviso — texto y label (por hash) del aviso fijo en un único lugar
  reutilizable por el router y el worker.
- `docs/INTEGRATION.md` — declarar `speech synthesize` y `speech play` como superficies
  5 y 6 consumidas por el plugin.
