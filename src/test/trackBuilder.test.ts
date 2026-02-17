import { describe, expect, it } from "vitest";
import { buildPremiumTrackDefinition } from "../track/data/premium-track";
import { TrackBuilder, measureAdjacentSegmentGaps } from "../track/trackBuilder";
import { collectTrackValidationErrors } from "../track/validateTrack";

describe("track builder", () => {
  it("builds deterministic premium track output", () => {
    const first = buildPremiumTrackDefinition();
    const second = buildPremiumTrackDefinition();

    expect(first).toEqual(second);
    expect(first.checkpoints).toHaveLength(8);
    expect(first.boostPads).toHaveLength(3);
    expect(first.segments.length).toBeGreaterThan(80);

    const validationErrors = collectTrackValidationErrors(first);
    expect(validationErrors).toEqual([]);
  });

  it("keeps segment continuity tight except intentional jump gaps", () => {
    const track = buildPremiumTrackDefinition();
    const gaps = measureAdjacentSegmentGaps(track.segments);

    const contiguous = gaps.filter((gap) => gap <= 0.45);
    const discontinuities = gaps.filter((gap) => gap > 0.45);

    expect(contiguous.length).toBeGreaterThan(20);
    expect(Math.max(...contiguous)).toBeLessThanOrEqual(0.45);
    expect(discontinuities).toHaveLength(2);
    expect(Math.min(...discontinuities)).toBeGreaterThan(8);
  });

  it("samples path distances with clamped bounds", () => {
    const builder = new TrackBuilder({ startPosition: [0, 0, 0], startYaw: 0 });
    builder.addStraight(24);

    const beforeStart = builder.samplePathAt(-5);
    const atStart = builder.samplePathAt(0);
    const afterEnd = builder.samplePathAt(500);
    const atEnd = builder.samplePathAt(builder.getTotalDistance());

    expect(beforeStart.position).toEqual(atStart.position);
    expect(afterEnd.position).toEqual(atEnd.position);
  });
});
