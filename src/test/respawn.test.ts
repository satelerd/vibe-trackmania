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

  it("respawns above jump-entry checkpoints and keeps forward orientation", () => {
    const track = loadPremiumTrack();
    for (const order of [1, 6]) {
      const checkpoint = track.checkpoints.find((candidate) => candidate.order === order);
      const nextCheckpoint = track.checkpoints.find((candidate) => candidate.order === order + 1);

      expect(checkpoint).toBeDefined();
      expect(nextCheckpoint).toBeDefined();

      const pose = resolveRespawnPose(track, order);
      expect(pose.position[1]).toBeGreaterThan((checkpoint?.position[1] ?? 0) + 0.5);

      const expectedYaw = Math.atan2(
        (nextCheckpoint?.position[0] ?? 0) - (checkpoint?.position[0] ?? 0),
        (nextCheckpoint?.position[2] ?? 0) - (checkpoint?.position[2] ?? 0)
      );

      expect(pose.yaw).toBeCloseTo(expectedYaw, 5);
    }
  });
});
