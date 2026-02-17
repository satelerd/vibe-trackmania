import { BoostPadDef, CheckpointDef, TrackDefinition, Vec3 } from "../../types";
import { TrackBuilder } from "../trackBuilder";

interface DistanceMarker {
  distance: number;
  id: string;
}

const CHECKPOINT_MARKERS: DistanceMarker[] = [
  { id: "cp0", distance: 48 },
  { id: "cp1", distance: 132 },
  { id: "cp2", distance: 206 },
  { id: "cp3", distance: 256 },
  { id: "cp4", distance: 318 },
  { id: "cp5", distance: 372 },
  { id: "cp6", distance: 446 },
  { id: "cp7", distance: 520 }
];

const BOOST_MARKERS: Array<
  DistanceMarker & {
    durationMs: number;
    force: number;
  }
> = [
  { id: "boost-start", distance: 62, force: 110, durationMs: 760 },
  { id: "boost-loop", distance: 238, force: 170, durationMs: 950 },
  { id: "boost-home", distance: 468, force: 125, durationMs: 700 }
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
        sampled.position[1] + (atLoopCrown ? 1.2 : 2.8),
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
    rampLength: 20,
    rampPitchDeg: 10,
    gapLength: 14,
    landingPitchDeg: -8,
    landingLength: 24,
    colorHex: 0x3d6f96,
    stepLength: 3.2
  });
  builder.addStraight(34, { colorHex: 0x406f9d, stepLength: 4.5 });
  builder.addPitchArc(18, 360, {
    colorHex: 0x3f5b91,
    railMode: "both",
    steps: 36
  });
  builder.addStraight(44, { colorHex: 0x315b90, stepLength: 5 });
  builder.addYawArc(60, -95, { bankDeg: -6, colorHex: 0x2a5f89, stepLength: 3.8 });
  builder.addJump({
    rampLength: 12,
    rampPitchDeg: 7,
    gapLength: 9,
    landingPitchDeg: -6,
    landingLength: 16,
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
