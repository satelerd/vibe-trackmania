import { InputState } from "../types";

const DEAD_ZONE = 0.16;
const CONTROL_KEY_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyR",
  "Backspace",
  "F8",
  "F9"
]);

interface GamepadRead {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  respawn: boolean;
  restart: boolean;
}

function withDeadZone(value: number): number {
  if (Math.abs(value) < DEAD_ZONE) {
    return 0;
  }

  return value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class InputManager {
  private readonly keysDown = new Set<string>();
  private prevRespawn = false;
  private prevRestart = false;
  private respawnQueued = false;
  private restartQueued = false;
  private traceToggleQueued = false;
  private traceDownloadQueued = false;

  private readonly keydownHandler = (event: KeyboardEvent): void => {
    if (CONTROL_KEY_CODES.has(event.code)) {
      event.preventDefault();
    }
    this.keysDown.add(event.code);

    if (event.code === "KeyR") {
      this.respawnQueued = true;
    }

    if (event.code === "Backspace") {
      this.restartQueued = true;
    }

    if (event.code === "F8") {
      this.traceToggleQueued = true;
    }

    if (event.code === "F9") {
      this.traceDownloadQueued = true;
    }
  };

  private readonly keyupHandler = (event: KeyboardEvent): void => {
    if (CONTROL_KEY_CODES.has(event.code)) {
      event.preventDefault();
    }
    this.keysDown.delete(event.code);
  };

  constructor(private readonly windowRef: Window = window) {
    this.windowRef.addEventListener("keydown", this.keydownHandler);
    this.windowRef.addEventListener("keyup", this.keyupHandler);
  }

  dispose(): void {
    this.windowRef.removeEventListener("keydown", this.keydownHandler);
    this.windowRef.removeEventListener("keyup", this.keyupHandler);
  }

  update(): InputState {
    const gamepad = this.readGamepad();

    const keyboardThrottle = this.keysDown.has("KeyW") || this.keysDown.has("ArrowUp") ? 1 : 0;
    const keyboardBrake = this.keysDown.has("KeyS") || this.keysDown.has("ArrowDown") ? 1 : 0;

    const steerLeft = this.keysDown.has("KeyA") || this.keysDown.has("ArrowLeft");
    const steerRight = this.keysDown.has("KeyD") || this.keysDown.has("ArrowRight");

    let keyboardSteer = 0;
    if (steerLeft) {
      keyboardSteer -= 1;
    }
    if (steerRight) {
      keyboardSteer += 1;
    }

    const throttle = Math.max(keyboardThrottle, gamepad.throttle);
    const brake = Math.max(keyboardBrake, gamepad.brake);
    const steer = Math.max(-1, Math.min(1, keyboardSteer + gamepad.steer));

    const handbrake = this.keysDown.has("Space") || gamepad.handbrake;

    const respawnHeld = gamepad.respawn;
    const restartHeld = gamepad.restart;

    const respawn = this.respawnQueued || (respawnHeld && !this.prevRespawn);
    const restart = this.restartQueued || (restartHeld && !this.prevRestart);

    this.respawnQueued = false;
    this.restartQueued = false;

    this.prevRespawn = respawnHeld;
    this.prevRestart = restartHeld;

    return {
      throttle,
      brake,
      steer,
      handbrake,
      respawn,
      restart
    };
  }

  hasIntent(input: InputState): boolean {
    return (
      input.throttle > 0.01 ||
      input.brake > 0.01 ||
      Math.abs(input.steer) > 0.01 ||
      input.handbrake ||
      input.respawn ||
      input.restart
    );
  }

  consumeTraceToggle(): boolean {
    const queued = this.traceToggleQueued;
    this.traceToggleQueued = false;
    return queued;
  }

  consumeTraceDownload(): boolean {
    const queued = this.traceDownloadQueued;
    this.traceDownloadQueued = false;
    return queued;
  }

  private readGamepad(): GamepadRead {
    if (typeof navigator === "undefined" || !navigator.getGamepads) {
      return {
        throttle: 0,
        brake: 0,
        steer: 0,
        handbrake: false,
        respawn: false,
        restart: false
      };
    }

    const [pad] = navigator.getGamepads();
    if (!pad) {
      return {
        throttle: 0,
        brake: 0,
        steer: 0,
        handbrake: false,
        respawn: false,
        restart: false
      };
    }

    const triggerThrottle = clamp01(pad.buttons[7]?.value ?? 0);
    const triggerBrake = clamp01(pad.buttons[6]?.value ?? 0);
    const steer = withDeadZone(pad.axes[0] ?? 0);

    return {
      throttle: triggerThrottle,
      brake: triggerBrake,
      steer,
      handbrake: Boolean(pad.buttons[1]?.pressed),
      respawn: Boolean(pad.buttons[0]?.pressed),
      restart: Boolean(pad.buttons[9]?.pressed)
    };
  }
}
