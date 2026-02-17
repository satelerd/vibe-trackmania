import { describe, expect, it } from "vitest";
import { loadPremiumTrack } from "../track/loadTrack";
import { collectTrackValidationErrors } from "../track/validateTrack";

describe("track validation", () => {
  it("accepts premium track with no validation errors", () => {
    const track = loadPremiumTrack();
    const errors = collectTrackValidationErrors(track);

    expect(errors).toEqual([]);
  });

  it("rejects tracks with non-sequential checkpoint order", () => {
    const track = loadPremiumTrack();

    track.checkpoints = [
      { ...track.checkpoints[0], order: 0 },
      { ...track.checkpoints[1], order: 2 }
    ];

    const errors = collectTrackValidationErrors(track);

    expect(
      errors.some((entry) => entry.includes("checkpoint orders deben ser secuenciales"))
    ).toBe(true);
  });

  it("rejects segments with invalid rotation payload", () => {
    const track = loadPremiumTrack();
    track.segments[0] = {
      ...track.segments[0],
      rotation: { yaw: Number.NaN, pitch: 0, roll: 0 }
    };

    const errors = collectTrackValidationErrors(track);
    expect(errors.some((entry) => entry.includes("rotation inválida"))).toBe(true);
  });

  it("rejects segments with invalid rail mode", () => {
    const track = loadPremiumTrack();
    track.segments[0] = {
      ...track.segments[0],
      railMode: "outer" as never
    };

    const errors = collectTrackValidationErrors(track);
    expect(errors.some((entry) => entry.includes("railMode inválido"))).toBe(true);
  });
});
