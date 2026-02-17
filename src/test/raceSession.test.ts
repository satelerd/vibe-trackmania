import { describe, expect, it } from "vitest";
import { RaceSession, advanceCheckpoint } from "../gameplay/raceSession";

describe("race session", () => {
  it("transitions idle -> countdown -> running", () => {
    const session = new RaceSession(2);

    session.update(16, true);
    expect(session.getState(0).phase).toBe("countdown");

    session.update(3000, false);
    expect(session.getState(0).phase).toBe("running");
  });

  it("finishes only when all checkpoints are passed in order", () => {
    const session = new RaceSession(3);

    session.update(1, true);
    session.update(3000, false);

    const wrongOrder = session.registerCheckpoint(1);
    expect(wrongOrder.valid).toBe(false);

    expect(session.registerCheckpoint(0).valid).toBe(true);
    expect(session.registerCheckpoint(1).valid).toBe(true);

    const finish = session.registerCheckpoint(2);
    expect(finish.finished).toBe(true);
    expect(session.getState(0).phase).toBe("finished");
  });

  it("advanceCheckpoint returns finished only at last checkpoint", () => {
    const mid = advanceCheckpoint(0, 0, 3);
    expect(mid.valid).toBe(true);
    expect(mid.finished).toBe(false);

    const end = advanceCheckpoint(2, 2, 3);
    expect(end.valid).toBe(true);
    expect(end.finished).toBe(true);
  });

  it("tracks split delta against previous best run", () => {
    const session = new RaceSession(2, 15_000, [5_000, 12_000]);

    session.update(1, true);
    session.update(3000, false);

    session.update(2_200, false);
    session.registerCheckpoint(0);

    const splitState = session.getState(0);
    expect(splitState.lastSplitMs).toBeGreaterThan(5_000);
    expect(splitState.lastSplitDeltaMs).toBeGreaterThan(0);
  });

  it("exposes countdown and go flash timers in race state", () => {
    const session = new RaceSession(2);

    session.update(100, true);
    const countdownState = session.getState(0);
    expect(countdownState.phase).toBe("countdown");
    expect(countdownState.countdownRemainingMs).toBeLessThan(3000);
    expect(countdownState.goFlashRemainingMs).toBe(0);

    session.update(4000, false);
    const runningState = session.getState(0);
    expect(runningState.phase).toBe("running");
    expect(runningState.goFlashRemainingMs).toBeGreaterThan(0);

    session.update(1000, false);
    expect(session.getState(0).goFlashRemainingMs).toBe(0);
  });
});
