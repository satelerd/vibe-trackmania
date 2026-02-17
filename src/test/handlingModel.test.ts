import { describe, expect, it } from "vitest";
import {
  computeSlipAngleDeg,
  computeSteerRate,
  computeYawStabilityTorque
} from "../physics/handlingModel";
import { VehicleTuning } from "../types";

const TEST_TUNING: VehicleTuning = {
  massKg: 1200,
  maxSpeedKmh: 315,
  engineForce: 4200,
  brakeForce: 95,
  steerRateLowSpeed: 0.6,
  steerRateHighSpeed: 0.31,
  steerBlendKmh: 220,
  suspensionRest: 0.35,
  suspensionSpring: 42,
  suspensionDamper: 4.2,
  tireGrip: 3.2,
  driftGripFactorRear: 0.54,
  airControlTorque: 13,
  airControlFactor: 0.6,
  yawStabilityGain: 2.15,
  yawStabilityMaxTorque: 8.5,
  slipAssistGain: 5.8,
  slipAssistMaxTorque: 5.4
};

describe("handling model", () => {
  it("computeSteerRate decreases as speed rises", () => {
    const low = computeSteerRate(0, TEST_TUNING);
    const medium = computeSteerRate(110, TEST_TUNING);
    const high = computeSteerRate(260, TEST_TUNING);

    expect(low).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(high);
    expect(high).toBeGreaterThanOrEqual(TEST_TUNING.steerRateHighSpeed);
  });

  it("computeSlipAngleDeg keeps left/right sign", () => {
    const forward = { x: 0, z: 1 };
    const rightSlip = computeSlipAngleDeg(forward, { x: 1, z: 4 });
    const leftSlip = computeSlipAngleDeg(forward, { x: -1, z: 4 });

    expect(rightSlip).toBeGreaterThan(0);
    expect(leftSlip).toBeLessThan(0);
  });

  it("computeYawStabilityTorque clamps to configured caps", () => {
    const largeNegative = computeYawStabilityTorque(99, 800, TEST_TUNING, true);
    const largePositive = computeYawStabilityTorque(-99, -800, TEST_TUNING, true);

    expect(largeNegative).toBeCloseTo(
      -(TEST_TUNING.yawStabilityMaxTorque + TEST_TUNING.slipAssistMaxTorque),
      5
    );
    expect(largePositive).toBeCloseTo(
      TEST_TUNING.yawStabilityMaxTorque + TEST_TUNING.slipAssistMaxTorque,
      5
    );
  });

  it("returns 0 torque when car is airborne", () => {
    const torque = computeYawStabilityTorque(4, 22, TEST_TUNING, false);
    expect(torque).toBe(0);
  });
});
