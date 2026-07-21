# Características pendientes

## Narración: cola FIFO persistente en el plugin (Opción 2)

**Estado:** pendiente. La Opción 1 (el worker espera a que el anterior termine su narración en vez de matarlo) ya está implementada en `src/narrate-worker.ts` y resuelve el solapamiento y la cancelación de la locución en curso para el caso de uso habitual (5 hooks, disparos ocasionales). Esta entrada documenta la mejora posterior.

### Qué es

Reemplazar el esquema actual —"un worker efímero por hook que espera su turno"— por un único worker persistente con una cola FIFO interna: cada hook apenda su texto a la cola (archivo de pendientes + lock o IPC) y el worker reproduce los elementos uno a uno con `tts-sidecar speak --daemon`.

### Por qué es superior a la Opción 1 (ventajas)

- **Orden libre de carreras por construcción:** un solo consumidor FIFO, sin cerradura de archivo PID ni ventana de carrera bajo ráfagas de hooks.
- **Un solo proceso** en vez de N workers desanclados vivos esperando su turno.
- **Ciclo de vida limpio:** el worker se puede apagar y drenar (p. ej. en `SessionEnd`: reproduce lo pendiente y sale).
- **Punto único para políticas y observabilidad:** limitar el largo de la cola, descartar el evento más viejo si se llena, y mostrar `pendientes: N` en `narrate-ctl status`.

### Cuándo implementar

Si en uso real se observan ráfagas de hooks que saturan la cadena de espera de la Opción 1, o si se quieren políticas de cola (tope de largo, descarte del más viejo, estado en `status`).
