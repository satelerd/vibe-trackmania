import { BoostPadDef, CheckpointDef, TrackDefinition, Vec3 } from "../../types";
import { TrackBuilder } from "../trackBuilder";

interface DistanceMarker {
  distance: number;
  id: string;
}

const CHECKPOINT_MARKERS: DistanceMarker[] = [
  { id: "cp0", distance: 48 },
  { id: "cp1", distance: 132 },
  { id: "cp2", distance: 224 },
  { id: "cp3", distance: 258 },
  { id: "cp4", distance: 346 },
  { id: "cp5", distance: 410 },
  { id: "cp6", distance: 550 },
  { id: "cp7", distance: 640 }
];

const BOOST_MARKERS: Array<
  DistanceMarker & {
    durationMs: number;
    force: number;
    size?: Vec3;
  }
> = [
  { id: "boost-start", distance: 62, force: 120, durationMs: 820 },
  {
    id: "boost-jump-entry",
    distance: 140,
    force: 430,
    durationMs: 2400,
    size: [28, 0.45, 34]
  },
  { id: "boost-loop-entry", distance: 258, force: 900, durationMs: 4200, size: [60, 0.45, 60] },
  { id: "boost-home", distance: 644, force: 180, durationMs: 900 }
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
      size: marker.size ?? [11, 0.45, 11],
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
    baseSegmentWidth: 24,
    baseSegmentThickness: 1
  });

  builder.addStraight(96, { colorHex: 0x264b6a, stepLength: 6 });
  builder.addYawArc(56, 38, { bankDeg: 10, colorHex: 0x2b5482, stepLength: 3.2 });
  builder.addStraight(42, { colorHex: 0x315f8f, stepLength: 4.7 });
  builder.addJump({
    rampLength: 18,
    rampPitchDeg: 22,
    gapLength: 14,
    gapDropMeters: 6.0,
    landingPitchDeg: -24,
    landingLength: 38,
    colorHex: 0x3d6f96,
    stepLength: 2.2,
    width: 27,
    railMode: "none"
  });
  builder.addStraight(34, { colorHex: 0x406f9d, stepLength: 4.2 });
  builder.addPitchArc(28, 52, {
    colorHex: 0x42659b,
    railMode: "both",
    steps: 14,
    width: 24
  });
  builder.addPitchArc(20, 256, {
    colorHex: 0x3f5b91,
    railMode: "both",
    steps: 36,
    width: 24
  });
  builder.addPitchArc(28, 52, {
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
