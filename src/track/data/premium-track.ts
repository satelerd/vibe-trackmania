import { BoostPadDef, CheckpointDef, TrackDefinition, Vec3 } from "../../types";
import { TrackBuilder } from "../trackBuilder";

interface DistanceMarker {
  distance: number;
  id: string;
}

const CHECKPOINT_MARKERS: DistanceMarker[] = [
  { id: "cp0", distance: 48 },
  { id: "cp1", distance: 122 },
  { id: "cp2", distance: 152 },
  { id: "cp3", distance: 238 },
  { id: "cp4", distance: 330 },
  { id: "cp5", distance: 452 },
  { id: "cp6", distance: 548 },
  { id: "cp7", distance: 640 }
];

const BOOST_MARKERS: Array<
  DistanceMarker & {
    durationMs: number;
    force: number;
  }
> = [
  { id: "boost-start", distance: 62, force: 120, durationMs: 820 },
  { id: "boost-jump-entry", distance: 148, force: 230, durationMs: 1200 },
  { id: "boost-loop-entry", distance: 288, force: 340, durationMs: 1700 },
  { id: "boost-home", distance: 568, force: 170, durationMs: 900 }
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
    baseSegmentWidth: 20,
    baseSegmentThickness: 1
  });

  builder.addStraight(96, { colorHex: 0x264b6a, stepLength: 6 });
  builder.addYawArc(58, 42, { bankDeg: 11, colorHex: 0x2b5482, stepLength: 3.4 });
  builder.addStraight(52, { colorHex: 0x315f8f, stepLength: 5.5 });
  builder.addJump({
    rampLength: 30,
    rampPitchDeg: 9,
    gapLength: 2.5,
    landingPitchDeg: -5,
    landingLength: 36,
    colorHex: 0x3d6f96,
    stepLength: 3,
    width: 22
  });
  builder.addStraight(80, { colorHex: 0x406f9d, stepLength: 4.6 });
  builder.addPitchArc(18, 65, {
    colorHex: 0x42659b,
    railMode: "both",
    steps: 16,
    width: 22
  });
  builder.addPitchArc(10, 230, {
    colorHex: 0x3f5b91,
    railMode: "both",
    steps: 28,
    width: 22
  });
  builder.addPitchArc(18, 65, {
    colorHex: 0x3a5689,
    railMode: "both",
    steps: 16,
    width: 22
  });
  builder.addStraight(64, { colorHex: 0x315b90, stepLength: 5.2 });
  builder.addYawArc(65, -84, { bankDeg: -5, colorHex: 0x2a5f89, stepLength: 3.9 });
  builder.addJump({
    rampLength: 16,
    rampPitchDeg: 7,
    gapLength: 4,
    landingPitchDeg: -5,
    landingLength: 22,
    colorHex: 0x2c4f7f,
    stepLength: 3,
    width: 21
  });
  builder.addStraight(96, { colorHex: 0x23456f, stepLength: 6 });

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
