import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildPremiumTrackDefinition } from "../track/data/premium-track";
import { TrackBuilder, measureAdjacentSegmentGaps } from "../track/trackBuilder";
import { collectTrackValidationErrors } from "../track/validateTrack";

describe("track builder", () => {
  it("builds deterministic premium track output", () => {
    const first = buildPremiumTrackDefinition();
    const second = buildPremiumTrackDefinition();

    expect(first).toEqual(second);
    expect(first.checkpoints).toHaveLength(8);
    expect(first.boostPads).toHaveLength(4);
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
    expect(discontinuities[0]).toBeGreaterThan(8);
    expect(discontinuities[1]).toBeGreaterThan(6);
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

  it("keeps checkpoints close to a drivable segment", () => {
    const track = buildPremiumTrackDefinition();

    const segmentStart = new THREE.Vector3();
    const segmentEnd = new THREE.Vector3();
    const segmentCenter = new THREE.Vector3();
    const checkpointPosition = new THREE.Vector3();
    const closest = new THREE.Vector3();
    const orientation = new THREE.Quaternion();
    const forward = new THREE.Vector3();

    for (const checkpoint of track.checkpoints) {
      checkpointPosition.fromArray(checkpoint.position);
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const segment of track.segments) {
        orientation.setFromEuler(
          new THREE.Euler(segment.rotation.pitch, segment.rotation.yaw, segment.rotation.roll, "YXZ")
        );
        forward.set(0, 0, 1).applyQuaternion(orientation).normalize();
        segmentCenter.fromArray(segment.position);

        segmentStart.copy(segmentCenter).addScaledVector(forward, -segment.size[2] * 0.5);
        segmentEnd.copy(segmentCenter).addScaledVector(forward, segment.size[2] * 0.5);

        closest.copy(checkpointPosition);
        const closestDistance = new THREE.Line3(segmentStart, segmentEnd)
          .closestPointToPoint(checkpointPosition, true, closest)
          .distanceTo(checkpointPosition);

        nearestDistance = Math.min(nearestDistance, closestDistance);
      }

      expect(nearestDistance).toBeLessThan(6.5);
    }
  });

  it("contains inverted segment orientation in loop module", () => {
    const track = buildPremiumTrackDefinition();
    const orientation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    const minUpY = Math.min(
      ...track.segments.map((segment) => {
        orientation.setFromEuler(
          new THREE.Euler(segment.rotation.pitch, segment.rotation.yaw, segment.rotation.roll, "YXZ")
        );
        return up.clone().applyQuaternion(orientation).normalize().y;
      })
    );

    expect(minUpY).toBeLessThan(-0.35);
  });
});
