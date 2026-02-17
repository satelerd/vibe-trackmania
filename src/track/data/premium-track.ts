import { BoostPadDef, CheckpointDef, TrackDefinition, Vec3 } from "../../types";
import { TrackBuilder } from "../trackBuilder";

interface DistanceMarker {
  distance: number;
  id: string;
}

const CHECKPOINT_MARKERS: DistanceMarker[] = [
  { id: "cp0", distance: 48 },
  { id: "cp1", distance: 126 },
  { id: "cp2", distance: 168 },
  { id: "cp3", distance: 252 },
  { id: "cp4", distance: 292 },
  { id: "cp5", distance: 430 },
  { id: "cp6", distance: 520 },
  { id: "cp7", distance: 610 }
];

const BOOST_MARKERS: Array<
  DistanceMarker & {
    durationMs: number;
    force: number;
  }
> = [
  { id: "boost-start", distance: 62, force: 120, durationMs: 820 },
  { id: "boost-jump-entry", distance: 164, force: 185, durationMs: 1000 },
  { id: "boost-loop-entry", distance: 300, force: 260, durationMs: 1300 },
  { id: "boost-home", distance: 544, force: 145, durationMs: 760 }
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
        sampled.position[1] + (atLoopCrown ? 2.2 : 2.8),
        sampled.position[2]
      ],
      size: atLoopCrown ? [18, 16, 18] : [16, 8, 12]
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
    baseSegmentWidth: 18,
    baseSegmentThickness: 1
  });

  builder.addStraight(96, { colorHex: 0x264b6a, stepLength: 6 });
  builder.addYawArc(52, 50, { bankDeg: 14, colorHex: 0x2b5482, stepLength: 3.2 });
  builder.addStraight(36, { colorHex: 0x315f8f, stepLength: 5.5 });
  builder.addJump({
    rampLength: 24,
    rampPitchDeg: 12,
    gapLength: 8,
    landingPitchDeg: -10,
    landingLength: 28,
    colorHex: 0x3d6f96,
    stepLength: 3.2
  });
  builder.addStraight(46, { colorHex: 0x406f9d, stepLength: 4.5 });
  builder.addPitchArc(20, 70, {
    colorHex: 0x42659b,
    railMode: "both",
    steps: 16
  });
  builder.addPitchArc(14, 220, {
    colorHex: 0x3f5b91,
    railMode: "both",
    steps: 24
  });
  builder.addPitchArc(18, 70, {
    colorHex: 0x3a5689,
    railMode: "both",
    steps: 16
  });
  builder.addStraight(44, { colorHex: 0x315b90, stepLength: 5 });
  builder.addYawArc(60, -95, { bankDeg: -6, colorHex: 0x2a5f89, stepLength: 3.8 });
  builder.addJump({
    rampLength: 14,
    rampPitchDeg: 8,
    gapLength: 6,
    landingPitchDeg: -7,
    landingLength: 18,
    colorHex: 0x2c4f7f,
    stepLength: 3
  });
  builder.addStraight(72, { colorHex: 0x23456f, stepLength: 6 });

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
