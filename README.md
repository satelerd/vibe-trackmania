# VibeTrack

VibeTrack es un Trackmania-like web-first construido con Vite + TypeScript + Three.js + Rapier. El objetivo es priorizar **feeling de manejo** (flow, retry instantáneo, boost, checkpoints) por sobre fidelidad visual.

## Estado del proyecto

- Modo: Time Attack solo
- Inputs: teclado + gamepad
- Cámara: third-person chase
- Features activas: checkpoints secuenciales, boost pads, respawn, restart, countdown, HUD, audio sintético

## Stack

- `vite`
- `typescript`
- `three`
- `@dimforge/rapier3d-compat`
- `vitest`

## Comandos

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

## Controles

- `W` / `ArrowUp` o gatillo derecho: acelerar
- `S` / `ArrowDown` o gatillo izquierdo: frenar
- `A` / `D` o stick izquierdo: girar
- `Space` o botón `B`: handbrake / drift assist
- `R` o botón `A`: respawn al último checkpoint
- `Backspace` o botón `Start`: reinicio completo de run

## Estructura

- `src/core`: loop y bootstrap del juego
- `src/physics`: vehículo y utilidades físicas
- `src/track`: definición de pista y runtime
- `src/gameplay`: sesión de carrera, checkpoints y respawn
- `src/input`: capa de entrada teclado/gamepad
- `src/camera`: cámara chase
- `src/ui`: HUD
- `src/audio`: audio procedural
- `src/test`: tests unitarios e integración

## Flujo de trabajo GitHub

- No commits directos a `main`
- Ramas obligatorias con prefijo `codex/`
- PR diaria con checklist de self-review
- Merge squash cuando CI está en verde
