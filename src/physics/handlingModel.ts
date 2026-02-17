import * as THREE from "three";
import { VehicleTuning } from "../types";

export interface PlanarVector {
  x: number;
  z: number;
}

export function computeSteerRate(speedKmh: number, tuning: VehicleTuning): number {
  const blend = THREE.MathUtils.clamp(
    speedKmh / Math.max(1, tuning.steerBlendKmh),
    0,
    1
  );

  return THREE.MathUtils.lerp(
    tuning.steerRateLowSpeed,
    tuning.steerRateHighSpeed,
    blend
  );
}

export function computeSlipAngleDeg(
  forward: PlanarVector,
  horizontalVelocity: PlanarVector
): number {
  const forwardLength = Math.hypot(forward.x, forward.z);
  const velocityLength = Math.hypot(horizontalVelocity.x, horizontalVelocity.z);

  if (forwardLength < 1e-4 || velocityLength < 1e-3) {
    return 0;
  }

  const normalizedForward = {
    x: forward.x / forwardLength,
    z: forward.z / forwardLength
  };

  const normalizedVelocity = {
    x: horizontalVelocity.x / velocityLength,
    z: horizontalVelocity.z / velocityLength
  };

  const dot = THREE.MathUtils.clamp(
    normalizedForward.x * normalizedVelocity.x +
      normalizedForward.z * normalizedVelocity.z,
    -1,
    1
  );

  const crossY =
    normalizedForward.z * normalizedVelocity.x -
    normalizedForward.x * normalizedVelocity.z;
  const angleRad = Math.atan2(crossY, dot);

  return THREE.MathUtils.radToDeg(angleRad);
}

export function computeYawStabilityTorque(
  yawRate: number,
  slipAngleDeg: number,
  tuning: VehicleTuning,
  grounded: boolean
): number {
  if (!grounded) {
    return 0;
  }

  const yawDampingTorque = THREE.MathUtils.clamp(
    -yawRate * tuning.yawStabilityGain,
    -tuning.yawStabilityMaxTorque,
    tuning.yawStabilityMaxTorque
  );

  const slipAssistTorque = THREE.MathUtils.clamp(
    -THREE.MathUtils.degToRad(slipAngleDeg) * tuning.slipAssistGain,
    -tuning.slipAssistMaxTorque,
    tuning.slipAssistMaxTorque
  );

  return yawDampingTorque + slipAssistTorque;
}
