# Development Plan (Post PR #4)

Objetivo: cerrar el gap entre estado actual y "se siente Trackmania" con entregas chicas, medibles y mergeables.

## Estado actual

- Core loop jugable: fisica, chase camera, checkpoints, respawn/restart, boost pads.
- Inputs: teclado y gamepad.
- HUD: tiempo, velocidad, checkpoint, best lap/splits.
- Audio base: motor/viento/boost/checkpoint.
- QA automatizada: unit + integration + Playwright e2e.
- Stunt track reconstruida con layout conectado (saltos + loop) y checkpoints calibrados para respawn util.
- Test API runtime para QA de secciones (`respawnAtCheckpoint`, `respawnAtSpawn`).
- Input Trace Lab activo:
  - grabacion y replay deterministico a 120 Hz
  - shortcuts runtime (`F8` grabar/parar, `F9` descargar)
  - smoke profile de replay para CI (`pnpm test:trace`)

## Brechas prioritarias

- Falta tuning fino de manejo para flow continuo (entrada/salida de curva, estabilidad a alta velocidad).
- Falta UX de carrera tipo time-attack (countdown fuerte, finish feedback, retry loop aun mas rapido).
- Falta pass de rendimiento y empaquetado (bundle grande, controles de presupuesto de FPS).

## Plan de ejecucion

### PR A — Handling feel pass (Day 3.1)

- Objetivo: que el auto sea predecible y divertido en 3 escenarios: recta, curva media, correccion en aire.
- Cambios:
  - Ajustar curva de direccion segun velocidad (low/high speed split).
  - Ajustar grip lateral delantero/trasero para reducir "snap".
  - Ajustar yaw damping dinamico para evitar sobre-rotacion al aterrizar.
  - Telemetria debug adicional para slip angle y yaw rate.
- Validacion:
  - Unit tests para funciones de tuning.
  - E2E: trayectorias consistentes en izquierda/derecha.
  - Manual: completar 3 vueltas seguidas sin spinouts no intencionales.

### PR B — Race loop punch (Day 3.2)

- Objetivo: reforzar sensacion de "una vuelta mas".
- Cambios:
  - Countdown 3-2-1-Go con bloqueo de input antes de GO.
  - Feedback fuerte de finish/checkpoint (HUD + audio).
  - Delta de split coloreada (verde/rojo) y animacion breve.
  - Respawn/restart con micro-freeze visual opcional (20-40 ms) para claridad.
- Validacion:
  - Integration tests de transiciones de fase.
  - E2E: finish solo tras checkpoints completos + restart limpia estado.
  - Manual: tiempo de restart percibido < 200 ms.

### PR C — Performance and ship pass (Day 3.3)

- Objetivo: 60 FPS estables en 1080p y CI robusta.
- Cambios:
  - Separar chunks (physics/three) para reducir warning de bundle.
  - Revisar materiales/sombras para costo GPU.
  - Preset de calidad simple (high/medium) en runtime.
  - Workflow CI con reporte de tiempo e2e y budget de build.
- Validacion:
  - Build sin regresion funcional.
  - E2E completa verde.
  - Medicion local: frame time promedio estable.

## Reglas operativas

- Mantener ramas `codex/...`.
- Commits pequenos y semanticos (4-8 por PR).
- Self-review checklist antes de merge squash.
- No abrir PR nueva hasta dejar verde la actual.
