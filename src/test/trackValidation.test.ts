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
});
