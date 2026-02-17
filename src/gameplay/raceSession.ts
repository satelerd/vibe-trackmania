import { RacePhase, RaceState } from "../types";

export interface CheckpointAdvanceResult {
  valid: boolean;
  finished: boolean;
  nextOrder: number;
}

export function advanceCheckpoint(
  currentOrder: number,
  incomingOrder: number,
  totalCheckpoints: number
): CheckpointAdvanceResult {
  if (totalCheckpoints <= 0) {
    return { valid: false, finished: false, nextOrder: currentOrder };
  }

  if (incomingOrder !== currentOrder) {
    return { valid: false, finished: false, nextOrder: currentOrder };
  }

  const finished = incomingOrder === totalCheckpoints - 1;
  return {
    valid: true,
    finished,
    nextOrder: finished ? totalCheckpoints : currentOrder + 1
  };
}

export class RaceSession {
  private phase: RacePhase = "idle";
  private elapsedMs = 0;
  private bestMs: number | null;
  private currentCheckpointOrder = 0;
  private countdownRemainingMs = 3000;

  constructor(
    private readonly totalCheckpoints: number,
    initialBestMs: number | null = null
  ) {
    this.bestMs = initialBestMs;
  }

  getCountdownRemainingMs(): number {
    return this.countdownRemainingMs;
  }

  update(deltaMs: number, startIntent: boolean): void {
    if (this.phase === "idle" && startIntent) {
      this.phase = "countdown";
      this.countdownRemainingMs = 3000;
    }

    if (this.phase === "countdown") {
      this.countdownRemainingMs = Math.max(0, this.countdownRemainingMs - deltaMs);
      if (this.countdownRemainingMs === 0) {
        this.phase = "running";
        this.elapsedMs = 0;
      }
    }

    if (this.phase === "running") {
      this.elapsedMs += deltaMs;
    }
  }

  registerCheckpoint(order: number): CheckpointAdvanceResult {
    if (this.phase !== "running") {
      return {
        valid: false,
        finished: false,
        nextOrder: this.currentCheckpointOrder
      };
    }

    const result = advanceCheckpoint(
      this.currentCheckpointOrder,
      order,
      this.totalCheckpoints
    );

    if (!result.valid) {
      return result;
    }

    this.currentCheckpointOrder = result.nextOrder;

    if (result.finished) {
      this.phase = "finished";
      if (this.bestMs === null || this.elapsedMs < this.bestMs) {
        this.bestMs = this.elapsedMs;
      }
    }

    return result;
  }

  restartRun(): void {
    this.phase = "idle";
    this.elapsedMs = 0;
    this.currentCheckpointOrder = 0;
    this.countdownRemainingMs = 3000;
  }

  getState(speedKmh: number): RaceState {
    return {
      phase: this.phase,
      elapsedMs: this.elapsedMs,
      bestMs: this.bestMs,
      currentCheckpointOrder: this.currentCheckpointOrder,
      speedKmh
    };
  }
}
