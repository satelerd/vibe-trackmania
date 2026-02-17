import { RaceState } from "../types";

interface HudTelemetry {
  speedKmh: number;
  boostRemainingMs: number;
}

function formatDelta(ms: number): string {
  const sign = ms >= 0 ? "+" : "-";
  return `${sign}${(Math.abs(ms) / 1000).toFixed(3)}s`;
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
  private readonly splitValue = document.createElement("div");
  private readonly centerValue = document.createElement("div");
  private lastRenderedSplitMs: number | null = null;
  private splitFlashTimeout: number | null = null;

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
    this.splitValue.className = "hud-split";
    this.centerValue.className = "hud-center";

    bottomPanel.append(this.statusValue, this.bestValue, this.checkpointValue, this.splitValue);

    const controls = document.createElement("div");
    controls.className = "hud-controls";
    controls.textContent =
      "W/Up: throttle | S/Down: brake-reverse | A/D or Left/Right: steer | Space/B: handbrake | R/A: respawn | Backspace/Start: restart";

    this.root.append(topPanel, this.centerValue, bottomPanel, controls);
    document.body.append(this.root);
  }

  update(state: RaceState, telemetry: HudTelemetry, autoRightCountdownMs: number): void {
    this.speedValue.textContent = `${Math.round(telemetry.speedKmh)} km/h`;

    if (state.phase === "idle") {
      this.timerValue.textContent = "00:00.000";
      this.statusValue.textContent = "Press throttle to start countdown";
    } else if (state.phase === "countdown") {
      this.timerValue.textContent = `${(state.countdownRemainingMs / 1000).toFixed(2)}s`;
      this.statusValue.textContent = "Countdown";
    } else if (state.phase === "running") {
      this.timerValue.textContent = formatLapTime(state.elapsedMs);
      const boostText =
        telemetry.boostRemainingMs > 0 ? ` | BOOST ${(telemetry.boostRemainingMs / 1000).toFixed(2)}s` : "";
      const autoRightText =
        autoRightCountdownMs > 0
          ? ` | AUTO-RIGHT ${(autoRightCountdownMs / 1000).toFixed(2)}s`
          : "";
      this.statusValue.textContent = `Racing${boostText}${autoRightText}`;
    } else {
      this.timerValue.textContent = formatLapTime(state.elapsedMs);
      this.statusValue.textContent = "Finish! Hit restart for another run";
    }

    if (state.phase === "countdown") {
      const countdownStep = Math.max(1, Math.ceil(state.countdownRemainingMs / 1000));
      this.centerValue.textContent = String(countdownStep);
      this.centerValue.className = "hud-center hud-center-countdown";
    } else if (state.goFlashRemainingMs > 0) {
      this.centerValue.textContent = "GO!";
      this.centerValue.className = "hud-center hud-center-go";
    } else {
      this.centerValue.textContent = "";
      this.centerValue.className = "hud-center";
    }

    if (state.bestMs !== null) {
      this.bestValue.textContent = `Best: ${formatLapTime(state.bestMs)}`;
    } else {
      this.bestValue.textContent = "Best: --:--.---";
    }

    this.checkpointValue.textContent = `Checkpoint: ${state.currentCheckpointOrder}`;
    this.splitValue.className = "hud-split";

    if (state.lastSplitMs === null) {
      this.splitValue.textContent = "Split: --";
      this.lastRenderedSplitMs = null;
      return;
    }

    if (state.lastSplitMs !== this.lastRenderedSplitMs) {
      this.lastRenderedSplitMs = state.lastSplitMs;
      this.triggerSplitFlash();
    }

    if (state.lastSplitDeltaMs === null) {
      this.splitValue.textContent = "Split: baseline";
      return;
    }

    if (state.lastSplitDeltaMs < 0) {
      this.splitValue.classList.add("hud-split-good");
    } else if (state.lastSplitDeltaMs > 0) {
      this.splitValue.classList.add("hud-split-bad");
    }

    this.splitValue.textContent = `Split Δ: ${formatDelta(state.lastSplitDeltaMs)}`;
  }

  private triggerSplitFlash(): void {
    this.splitValue.classList.add("hud-split-flash");
    if (this.splitFlashTimeout !== null) {
      window.clearTimeout(this.splitFlashTimeout);
    }

    this.splitFlashTimeout = window.setTimeout(() => {
      this.splitValue.classList.remove("hud-split-flash");
      this.splitFlashTimeout = null;
    }, 260);
  }
}
