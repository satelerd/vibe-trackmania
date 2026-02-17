import { RaceState } from "../types";

interface HudTelemetry {
  speedKmh: number;
  boostRemainingMs: number;
}

function formatLapTime(ms: number): string {
  const totalMilliseconds = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(totalMilliseconds / 60000)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor((totalMilliseconds % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  const millis = (totalMilliseconds % 1000).toString().padStart(3, "0");

  return `${minutes}:${seconds}.${millis}`;
}

export class Hud {
  private readonly root = document.createElement("div");
  private readonly timerValue = document.createElement("div");
  private readonly speedValue = document.createElement("div");
  private readonly statusValue = document.createElement("div");
  private readonly bestValue = document.createElement("div");
  private readonly checkpointValue = document.createElement("div");

  constructor() {
    this.root.className = "hud-root";

    const topPanel = document.createElement("div");
    topPanel.className = "hud-top";

    this.timerValue.className = "hud-timer";
    this.speedValue.className = "hud-speed";

    topPanel.append(this.timerValue, this.speedValue);

    const bottomPanel = document.createElement("div");
    bottomPanel.className = "hud-bottom";

    this.statusValue.className = "hud-status";
    this.bestValue.className = "hud-best";
    this.checkpointValue.className = "hud-checkpoint";

    bottomPanel.append(this.statusValue, this.bestValue, this.checkpointValue);

    const controls = document.createElement("div");
    controls.className = "hud-controls";
    controls.textContent =
      "WASD/Arrows: drive | Space/B: handbrake | R/A: respawn | Backspace/Start: restart";

    this.root.append(topPanel, bottomPanel, controls);
    document.body.append(this.root);
  }

  update(state: RaceState, telemetry: HudTelemetry, countdownMs: number): void {
    this.speedValue.textContent = `${Math.round(telemetry.speedKmh)} km/h`;

    if (state.phase === "idle") {
      this.timerValue.textContent = "00:00.000";
      this.statusValue.textContent = "Press throttle to start countdown";
    } else if (state.phase === "countdown") {
      this.timerValue.textContent = `${(countdownMs / 1000).toFixed(2)}s`;
      this.statusValue.textContent = "Countdown";
    } else if (state.phase === "running") {
      this.timerValue.textContent = formatLapTime(state.elapsedMs);
      const boostText =
        telemetry.boostRemainingMs > 0 ? ` | BOOST ${(telemetry.boostRemainingMs / 1000).toFixed(2)}s` : "";
      this.statusValue.textContent = `Racing${boostText}`;
    } else {
      this.timerValue.textContent = formatLapTime(state.elapsedMs);
      this.statusValue.textContent = "Finish! Hit restart for another run";
    }

    if (state.bestMs !== null) {
      this.bestValue.textContent = `Best: ${formatLapTime(state.bestMs)}`;
    } else {
      this.bestValue.textContent = "Best: --:--.---";
    }

    this.checkpointValue.textContent = `Checkpoint: ${state.currentCheckpointOrder}`;
  }
}
