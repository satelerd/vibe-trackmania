import { describe, expect, it } from "vitest";
import { RaceSession } from "../gameplay/raceSession";
import { applyBoostImpulse } from "../physics/vehicleMath";

describe("race integration expectations", () => {
  it("completes lap only after sequential checkpoints", () => {
    const session = new RaceSession(2);

    session.update(20, true);
    session.update(3000, false);

    session.registerCheckpoint(0);
    expect(session.getState(0).phase).toBe("running");

    session.registerCheckpoint(1);
    expect(session.getState(0).phase).toBe("finished");
  });

  it("boost impulse increases speed on a straight", () => {
    const boosted = applyBoostImpulse(40, 110, 800, 1200);
    expect(boosted).toBeGreaterThan(40);
  });

  it("restart clears run progress", () => {
    const session = new RaceSession(3);

    session.update(16, true);
    session.update(3000, false);
    session.registerCheckpoint(0);

    session.restartRun();

    const state = session.getState(0);
    expect(state.phase).toBe("idle");
    expect(state.currentCheckpointOrder).toBe(0);
    expect(state.elapsedMs).toBe(0);
  });
});
