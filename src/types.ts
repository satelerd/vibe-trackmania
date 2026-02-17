export type Vec3 = [number, number, number];

export type RacePhase = "idle" | "countdown" | "running" | "finished";

export interface InputState {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  respawn: boolean;
  restart: boolean;
}

export interface VehicleTuning {
  massKg: number;
  maxSpeedKmh: number;
  engineForce: number;
  brakeForce: number;
  steerRateLowSpeed: number;
  steerRateHighSpeed: number;
  steerBlendKmh: number;
  suspensionRest: number;
  suspensionSpring: number;
  suspensionDamper: number;
  tireGrip: number;
  driftGripFactorRear: number;
  airControlTorque: number;
  airControlFactor: number;
  yawStabilityGain: number;
  yawStabilityMaxTorque: number;
  slipAssistGain: number;
  slipAssistMaxTorque: number;
}

export interface CheckpointDef {
  id: string;
  position: Vec3;
  size: Vec3;
  order: number;
}

export interface TrackSegmentDef {
  id: string;
  position: Vec3;
  size: Vec3;
  yaw: number;
  colorHex?: number;
}

export interface BoostPadDef {
  id: string;
  position: Vec3;
  size: Vec3;
  force: number;
  durationMs: number;
}

export interface TrackDefinition {
  id: string;
  name: string;
  spawn: { position: Vec3; yaw: number };
  checkpoints: CheckpointDef[];
  boostPads: BoostPadDef[];
  segments: TrackSegmentDef[];
}

export interface RaceState {
  phase: RacePhase;
  elapsedMs: number;
  bestMs: number | null;
  currentCheckpointOrder: number;
  speedKmh: number;
  lastSplitMs: number | null;
  lastSplitDeltaMs: number | null;
  countdownRemainingMs: number;
  goFlashRemainingMs: number;
}

export interface RespawnPose {
  position: Vec3;
  yaw: number;
}

export interface VehicleTelemetry {
  speedKmh: number;
  isGrounded: boolean;
  boostRemainingMs: number;
}

export interface DebugSnapshot {
  speedKmh: number;
  phase: RacePhase;
  position: Vec3;
  forward: Vec3;
  checkpointOrder: number;
  boostRemainingMs: number;
  inputSteer: number;
  steeringAngle: number;
  autoRightCountdownMs: number;
  slipAngleDeg: number;
  yawRate: number;
  yawAssistTorque: number;
}
