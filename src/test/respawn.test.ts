import { describe, expect, it } from "vitest";
import { resolveRespawnPose } from "../gameplay/respawn";
import { loadPremiumTrack } from "../track/loadTrack";

describe("respawn", () => {
  it("uses spawn when no checkpoint has been reached", () => {
    const track = loadPremiumTrack();
    const pose = resolveRespawnPose(track, -1);

    expect(pose.position).toEqual(track.spawn.position);
    expect(pose.yaw).toBe(track.spawn.yaw);
  });

  it("respawns above checkpoint and oriented to next checkpoint", () => {
    const track = loadPremiumTrack();
    const pose = resolveRespawnPose(track, 1);

    expect(pose.position[1]).toBeGreaterThan(track.checkpoints[1].position[1]);

    const expectedYaw = Math.atan2(
      track.checkpoints[2].position[0] - track.checkpoints[1].position[0],
      track.checkpoints[2].position[2] - track.checkpoints[1].position[2]
    );

    expect(pose.yaw).toBeCloseTo(expectedYaw, 5);
  });
});
