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
  private lastSplitMs: number | null = null;
  private lastSplitDeltaMs: number | null = null;
  private readonly bestSplitsMs: Array<number | null>;
  private currentSplitsMs: Array<number | null>;

  constructor(
    private readonly totalCheckpoints: number,
    initialBestMs: number | null = null,
    initialBestSplitsMs: number[] | null = null
  ) {
    this.bestMs = initialBestMs;
    this.bestSplitsMs = new Array(this.totalCheckpoints).fill(null);
    this.currentSplitsMs = new Array(this.totalCheckpoints).fill(null);

    if (initialBestSplitsMs) {
      for (
        let checkpointIndex = 0;
        checkpointIndex < Math.min(initialBestSplitsMs.length, this.totalCheckpoints);
        checkpointIndex += 1
      ) {
        const value = initialBestSplitsMs[checkpointIndex];
        this.bestSplitsMs[checkpointIndex] = Number.isFinite(value) ? value : null;
      }
    }
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
    this.currentSplitsMs[order] = this.elapsedMs;
    this.lastSplitMs = this.elapsedMs;

    const bestSplitMs = this.bestSplitsMs[order];
    this.lastSplitDeltaMs =
      bestSplitMs === null ? null : this.elapsedMs - bestSplitMs;

    if (result.finished) {
      this.phase = "finished";
      if (this.bestMs === null || this.elapsedMs < this.bestMs) {
        this.bestMs = this.elapsedMs;
        this.bestSplitsMs.splice(
          0,
          this.bestSplitsMs.length,
          ...this.currentSplitsMs
        );
      }
    }

    return result;
  }

  restartRun(): void {
    this.phase = "idle";
    this.elapsedMs = 0;
    this.currentCheckpointOrder = 0;
    this.countdownRemainingMs = 3000;
    this.lastSplitMs = null;
    this.lastSplitDeltaMs = null;
    this.currentSplitsMs = new Array(this.totalCheckpoints).fill(null);
  }

  getBestSplits(): number[] | null {
    const splits: number[] = [];
    for (const value of this.bestSplitsMs) {
      if (value === null) {
        return null;
      }
      splits.push(value);
    }

    return splits;
  }

  getState(speedKmh: number): RaceState {
    return {
      phase: this.phase,
      elapsedMs: this.elapsedMs,
      bestMs: this.bestMs,
      currentCheckpointOrder: this.currentCheckpointOrder,
      speedKmh,
      lastSplitMs: this.lastSplitMs,
      lastSplitDeltaMs: this.lastSplitDeltaMs
    };
  }
}
