import { BoostPadDef, CheckpointDef, TrackDefinition, Vec3 } from "../../types";
import { TrackBuilder } from "../trackBuilder";

interface DistanceMarker {
  distance: number;
  id: string;
}

const CHECKPOINT_MARKERS: DistanceMarker[] = [
  { id: "cp0", distance: 48 },
  { id: "cp1", distance: 176 },
  { id: "cp2", distance: 188 },
  { id: "cp3", distance: 200 },
  { id: "cp4", distance: 372 },
  { id: "cp5", distance: 430 },
  { id: "cp6", distance: 548 },
  { id: "cp7", distance: 632 }
];

const BOOST_MARKERS: Array<
  DistanceMarker & {
    durationMs: number;
    force: number;
  }
> = [
  { id: "boost-start", distance: 62, force: 120, durationMs: 820 },
  { id: "boost-jump-entry", distance: 184, force: 280, durationMs: 1500 },
  { id: "boost-loop-entry", distance: 340, force: 520, durationMs: 2600 },
  { id: "boost-home", distance: 628, force: 180, durationMs: 900 }
];

function buildCheckpoints(builder: TrackBuilder): CheckpointDef[] {
  return CHECKPOINT_MARKERS.map((marker, order) => {
    const sampled = builder.samplePathAt(marker.distance);
    const atLoopCrown = marker.id === "cp4";

    return {
      id: marker.id,
      order,
      position: [
        sampled.position[0],
        sampled.position[1] + (atLoopCrown ? 1.1 : 2.8),
        sampled.position[2]
      ],
      size: atLoopCrown ? [30, 24, 30] : [16, 8, 12]
    };
  });
}

function buildBoostPads(builder: TrackBuilder): BoostPadDef[] {
  return BOOST_MARKERS.map((marker) => {
    const sampled = builder.samplePathAt(marker.distance);
    const position: Vec3 = [sampled.position[0], sampled.position[1] + 0.9, sampled.position[2]];
    return {
      id: marker.id,
      position,
      size: [11, 0.45, 11],
      force: marker.force,
      durationMs: marker.durationMs
    };
  });
}

export function buildPremiumTrackDefinition(): TrackDefinition {
  const builder = new TrackBuilder({
    idPrefix: "premium-seg",
    startPosition: [0, 0, 0],
    startYaw: 0,
    baseSegmentWidth: 20,
    baseSegmentThickness: 1
  });

  builder.addStraight(96, { colorHex: 0x264b6a, stepLength: 6 });
  builder.addYawArc(52, 50, { bankDeg: 14, colorHex: 0x2b5482, stepLength: 3.1 });
  builder.addStraight(36, { colorHex: 0x315f8f, stepLength: 4.5 });
  builder.addJump({
    rampLength: 19,
    rampPitchDeg: 20,
    gapLength: 13,
    gapDropMeters: 4.8,
    landingPitchDeg: -18,
    landingLength: 34,
    colorHex: 0x3d6f96,
    stepLength: 2.4,
    width: 24
  });
  builder.addStraight(34, { colorHex: 0x406f9d, stepLength: 4.2 });
  builder.addPitchArc(22, 52, {
    colorHex: 0x42659b,
    railMode: "both",
    steps: 14,
    width: 24
  });
  builder.addPitchArc(12.5, 256, {
    colorHex: 0x3f5b91,
    railMode: "both",
    steps: 36,
    width: 24
  });
  builder.addPitchArc(22, 52, {
    colorHex: 0x3a5689,
    railMode: "both",
    steps: 14,
    width: 24
  });
  builder.addStraight(44, { colorHex: 0x315b90, stepLength: 4.6 });
  builder.addYawArc(60, -95, { bankDeg: -6, colorHex: 0x2a5f89, stepLength: 3.4 });
  builder.addStraight(30, { colorHex: 0x355882, stepLength: 4.2 });
  builder.addJump({
    rampLength: 14,
    rampPitchDeg: 10,
    gapLength: 8.5,
    gapDropMeters: 1.8,
    landingPitchDeg: -10,
    landingLength: 20,
    colorHex: 0x2c4f7f,
    stepLength: 2.6,
    width: 21
  });
  builder.addStraight(72, { colorHex: 0x23456f, stepLength: 5.2 });

  return {
    id: "vibetrack-stunt-alpha",
    name: "VibeTrack Stunt Sprint",
    spawn: {
      position: [0, 4, 2],
      yaw: 0
    },
    segments: builder.buildSegments(),
    checkpoints: buildCheckpoints(builder),
    boostPads: buildBoostPads(builder)
  };
}

export const premiumTrackDefinition = buildPremiumTrackDefinition();
