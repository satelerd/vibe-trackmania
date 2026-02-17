import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { InputState, RespawnPose, VehicleTelemetry, VehicleTuning } from "../types";
import {
  computeSlipAngleDeg,
  computeSteerRate,
  computeYawStabilityTorque
} from "./handlingModel";

type RapierWorld = import("@dimforge/rapier3d-compat").World;
type RapierRigidBody = import("@dimforge/rapier3d-compat").RigidBody;
type RapierVehicleController = import("@dimforge/rapier3d-compat").DynamicRayCastVehicleController;

interface WheelRuntime {
  mesh: THREE.Mesh;
  baseOffset: THREE.Vector3;
}

const WHEEL_RADIUS = 0.43;
const CHASSIS_HALF_EXTENTS = { x: 1.03, y: 0.4, z: 2.15 } as const;
const CHASSIS_LOCAL_TRANSLATION = { x: 0, y: -0.2, z: 0 } as const;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FLY_BASE_THRUST_MULTIPLIER = 1.45;
const FLY_BASE_LIFT_MULTIPLIER = 1.28;
const FLY_CLIMB_FORCE_MULTIPLIER = 2.95;
const FLY_STRAFE_FORCE_MULTIPLIER = 0.45;
const FLY_MAX_SPEED_MULTIPLIER = 1.32;
const FLY_MAX_SPEED_TURBO_MULTIPLIER = 1.88;
const FLY_TURBO_FORCE_MULTIPLIER = 1.75;
const FLY_DRAG_COEFFICIENT = 0.55;
const FLY_DRAG_COEFFICIENT_TURBO = 0.28;

export class VehicleController {
  readonly sceneGroup = new THREE.Group();

  private readonly body: RapierRigidBody;
  private readonly vehicle: RapierVehicleController;
  private readonly wheelRuntimes: WheelRuntime[] = [];

  private boostRemainingMs = 0;
  private boostForce = 0;
  private appliedBrakeForce = 0;

  private steeringAngle = 0;
  private speedMs = 0;
  private grounded = false;
  private slipAngleDeg = 0;
  private yawRate = 0;
  private yawAssistTorque = 0;
  private flyModeEnabled = false;
  private flightTurboEnabled = false;
  private flightPulseSeconds = 0;

  private readonly forwardVector = new THREE.Vector3(0, 0, 1);
  private readonly upVector = new THREE.Vector3(0, 1, 0);
  private readonly workingQuaternion = new THREE.Quaternion();
  private readonly workingUpVector = new THREE.Vector3();
  private readonly workingForwardVector = new THREE.Vector3();
  private readonly workingRightVector = new THREE.Vector3();
  private readonly workingLinearVelocity = new THREE.Vector3();
  private readonly workingAngularVelocity = new THREE.Vector3();
  private readonly workingVector2 = new THREE.Vector2();
  private readonly bodyMaterial = new THREE.MeshStandardMaterial({
    color: "#ff5d2f",
    metalness: 0.42,
    roughness: 0.31
  });
  private readonly cockpitMaterial = new THREE.MeshStandardMaterial({
    color: "#b7d9f0",
    metalness: 0.8,
    roughness: 0.12
  });

  constructor(
    private readonly world: RapierWorld,
    scene: THREE.Scene,
    spawnPose: RespawnPose,
    private readonly tuning: VehicleTuning
  ) {
    this.sceneGroup.name = "player-vehicle";

    const initialRotation = new RAPIER.Quaternion(
      0,
      Math.sin(spawnPose.yaw * 0.5),
      0,
      Math.cos(spawnPose.yaw * 0.5)
    );

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...spawnPose.position)
      .setRotation(initialRotation)
      .setLinearDamping(0.32)
      .setAngularDamping(0.65)
      .setCanSleep(false);

    this.body = this.world.createRigidBody(bodyDesc);
    this.body.setAdditionalSolverIterations(4);

    const chassisVolume =
      CHASSIS_HALF_EXTENTS.x *
      2 *
      CHASSIS_HALF_EXTENTS.y *
      2 *
      CHASSIS_HALF_EXTENTS.z *
      2;
    const chassisDensity = Math.max(1, this.tuning.massKg / Math.max(0.0001, chassisVolume));

    const chassisCollider = RAPIER.ColliderDesc.cuboid(
      CHASSIS_HALF_EXTENTS.x,
      CHASSIS_HALF_EXTENTS.y,
      CHASSIS_HALF_EXTENTS.z
    )
      .setTranslation(
        CHASSIS_LOCAL_TRANSLATION.x,
        CHASSIS_LOCAL_TRANSLATION.y,
        CHASSIS_LOCAL_TRANSLATION.z
      )
      .setDensity(chassisDensity)
      .setFriction(1.1)
      .setRestitution(0.0);

    this.world.createCollider(chassisCollider, this.body);

    this.vehicle = this.world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;

    this.setupWheels();
    this.setupVehicleVisual();

    scene.add(this.sceneGroup);
    this.syncVisuals(0);
  }

  preStep(input: InputState, deltaSeconds: number): void {
    if (this.flyModeEnabled) {
      this.preStepFlight(input, deltaSeconds);
      return;
    }

    const speedKmh = Math.abs(this.speedMs) * 3.6;
    const steerRate = computeSteerRate(speedKmh, this.tuning);
    const steeringInput = -input.steer;
    this.steeringAngle = steeringInput * steerRate;

    const canUseReverseEngine =
      input.brake > 0 &&
      (Math.abs(this.speedMs) < 2.2 || this.speedMs < -0.4);
    const reverseForce = canUseReverseEngine
      ? input.brake * this.tuning.engineForce * 0.72
      : 0;
    const throttleForce = input.throttle * this.tuning.engineForce - reverseForce;
    const serviceBrakeForce = canUseReverseEngine ? 0 : input.brake * this.tuning.brakeForce;
    const handbrakeForce = input.handbrake ? this.tuning.brakeForce * 0.72 : 0;
    const targetBrakeForce = serviceBrakeForce + handbrakeForce;
    const brakeRiseRate = 3.4;
    const brakeReleaseRate = 11;
    const brakeRate =
      targetBrakeForce > this.appliedBrakeForce ? brakeRiseRate : brakeReleaseRate;
    const brakeRamp = 1 - Math.exp(-brakeRate * deltaSeconds);
    this.appliedBrakeForce = THREE.MathUtils.lerp(
      this.appliedBrakeForce,
      targetBrakeForce,
      brakeRamp
    );

    const gripSpeedFactor = THREE.MathUtils.clamp(
      speedKmh / Math.max(1, this.tuning.maxSpeedKmh),
      0,
      1
    );
    const frontGrip = 1 + gripSpeedFactor * 0.15;
    const rearStabilityGrip = THREE.MathUtils.lerp(1, 0.88, gripSpeedFactor);
    const rearGrip = input.handbrake
      ? this.tuning.driftGripFactorRear
      : rearStabilityGrip;

    this.configureWheelControl(
      0,
      this.steeringAngle,
      throttleForce,
      this.appliedBrakeForce,
      frontGrip
    );
    this.configureWheelControl(
      1,
      this.steeringAngle,
      throttleForce,
      this.appliedBrakeForce,
      frontGrip
    );
    this.configureWheelControl(2, 0, throttleForce, this.appliedBrakeForce, rearGrip);
    this.configureWheelControl(3, 0, throttleForce, this.appliedBrakeForce, rearGrip);

    this.applyBoostImpulse(deltaSeconds);

    const bodyVelocity = this.body.linvel();
    this.getForwardVector(this.workingForwardVector);
    this.slipAngleDeg = computeSlipAngleDeg(
      { x: this.workingForwardVector.x, z: this.workingForwardVector.z },
      { x: bodyVelocity.x, z: bodyVelocity.z }
    );
    this.yawRate = this.body.angvel().y;
    this.yawAssistTorque = computeYawStabilityTorque(
      this.yawRate,
      this.slipAngleDeg,
      this.tuning,
      this.grounded
    );

    if (!this.grounded) {
      this.body.applyTorqueImpulse(
        {
          x: 0,
          y:
            steeringInput *
            this.tuning.airControlTorque *
            this.tuning.airControlFactor *
            deltaSeconds,
          z: 0
        },
        true
      );
    }

    if (this.grounded && Math.abs(this.yawAssistTorque) > 0.0001) {
      this.body.applyTorqueImpulse(
        {
          x: 0,
          y: this.yawAssistTorque * deltaSeconds,
          z: 0
        },
        true
      );
    }

    this.body.applyTorqueImpulse(
      {
        x: -this.body.angvel().x * 0.03,
        y: -this.body.angvel().y * 0.025,
        z: -this.body.angvel().z * 0.03
      },
      true
    );

    this.vehicle.updateVehicle(deltaSeconds);
  }

  postStep(deltaSeconds: number): void {
    if (this.flyModeEnabled) {
      this.grounded = false;
    } else {
      this.grounded = false;
      for (let wheelIndex = 0; wheelIndex < this.vehicle.numWheels(); wheelIndex += 1) {
        if (this.vehicle.wheelIsInContact(wheelIndex)) {
          this.grounded = true;
          break;
        }
      }
    }

    const bodyVelocity = this.body.linvel();
    this.workingVector2.set(bodyVelocity.x, bodyVelocity.z);

    const horizontalSpeed = this.workingVector2.length();
    this.speedMs = this.flyModeEnabled ? horizontalSpeed : this.vehicle.currentVehicleSpeed();

    const maxSpeedMultiplier = this.flyModeEnabled
      ? this.flightTurboEnabled
        ? FLY_MAX_SPEED_TURBO_MULTIPLIER
        : FLY_MAX_SPEED_MULTIPLIER
      : 1;
    const maxSpeedMs = (this.tuning.maxSpeedKmh * maxSpeedMultiplier) / 3.6;
    if (horizontalSpeed > maxSpeedMs) {
      this.workingVector2.setLength(maxSpeedMs);
      this.body.setLinvel(
        {
          x: this.workingVector2.x,
          y: bodyVelocity.y,
          z: this.workingVector2.y
        },
        true
      );
    }

    if (this.boostRemainingMs > 0) {
      this.boostRemainingMs = Math.max(0, this.boostRemainingMs - deltaSeconds * 1000);
    }

    this.syncVisuals(deltaSeconds);
  }

  activateBoost(force: number, durationMs: number): void {
    this.boostForce = Math.max(this.boostForce, force);
    this.boostRemainingMs = Math.max(this.boostRemainingMs, durationMs);
  }

  respawn(pose: RespawnPose): void {
    this.body.setTranslation(
      {
        x: pose.position[0],
        y: pose.position[1],
        z: pose.position[2]
      },
      true
    );

    this.body.setRotation(
      {
        x: 0,
        y: Math.sin(pose.yaw * 0.5),
        z: 0,
        w: Math.cos(pose.yaw * 0.5)
      },
      true
    );

    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.speedMs = 0;
    this.boostRemainingMs = 0;
    this.boostForce = 0;
    this.appliedBrakeForce = 0;
    this.slipAngleDeg = 0;
    this.yawRate = 0;
    this.yawAssistTorque = 0;

    this.syncVisuals(0);
  }

  getPosition(target: THREE.Vector3): THREE.Vector3 {
    const translation = this.body.translation();
    return target.set(translation.x, translation.y, translation.z);
  }

  getForwardVector(target: THREE.Vector3): THREE.Vector3 {
    const rotation = this.body.rotation();
    this.workingQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    return target.copy(this.forwardVector).applyQuaternion(this.workingQuaternion).normalize();
  }

  getUpVector(target: THREE.Vector3): THREE.Vector3 {
    const rotation = this.body.rotation();
    this.workingQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    return target.copy(this.upVector).applyQuaternion(this.workingQuaternion).normalize();
  }

  getSteeringAngle(): number {
    return this.steeringAngle;
  }

  getSlipAngleDeg(): number {
    return this.slipAngleDeg;
  }

  getYawRate(): number {
    return this.yawRate;
  }

  getYawAssistTorque(): number {
    return this.yawAssistTorque;
  }

  isUpsideDown(): boolean {
    return this.getUpVector(this.workingUpVector).y < 0.15;
  }

  getTelemetry(): VehicleTelemetry {
    return {
      speedKmh: Math.abs(this.speedMs) * 3.6,
      isGrounded: this.grounded,
      boostRemainingMs: this.boostRemainingMs,
      flyModeEnabled: this.flyModeEnabled,
      flightTurboEnabled: this.flightTurboEnabled
    };
  }

  setFlyMode(enabled: boolean): void {
    this.flyModeEnabled = enabled;
    this.flightTurboEnabled = false;
    this.appliedBrakeForce = 0;
    this.steeringAngle = 0;
    this.flightPulseSeconds = 0;
    this.yawAssistTorque = 0;
    if (enabled) {
      this.body.applyImpulse({ x: 0, y: 9.5, z: 0 }, true);
    }
  }

  isFlyModeEnabled(): boolean {
    return this.flyModeEnabled;
  }

  setFlightTurbo(enabled: boolean): void {
    this.flightTurboEnabled = this.flyModeEnabled && enabled;
  }

  setForwardSpeedKmh(speedKmh: number): void {
    const speedMs = Math.max(0, speedKmh) / 3.6;
    this.getForwardVector(this.workingForwardVector);

    const currentLinearVelocity = this.body.linvel();
    this.body.setLinvel(
      {
        x: this.workingForwardVector.x * speedMs,
        y: currentLinearVelocity.y,
        z: this.workingForwardVector.z * speedMs
      },
      true
    );
    this.speedMs = speedMs;
  }

  private setupWheels(): void {
    const wheelOffsets = [
      new THREE.Vector3(1.0, -0.4, 1.37),
      new THREE.Vector3(-1.0, -0.4, 1.37),
      new THREE.Vector3(1.0, -0.4, -1.35),
      new THREE.Vector3(-1.0, -0.4, -1.35)
    ];

    const suspensionDirection = { x: 0, y: -1, z: 0 };
    const axleDirection = { x: -1, y: 0, z: 0 };

    for (const offset of wheelOffsets) {
      this.vehicle.addWheel(
        { x: offset.x, y: offset.y, z: offset.z },
        suspensionDirection,
        axleDirection,
        this.tuning.suspensionRest,
        WHEEL_RADIUS
      );
    }

    for (let index = 0; index < this.vehicle.numWheels(); index += 1) {
      this.vehicle.setWheelMaxSuspensionTravel(index, 0.34);
      this.vehicle.setWheelSuspensionStiffness(index, this.tuning.suspensionSpring);
      this.vehicle.setWheelSuspensionCompression(index, this.tuning.suspensionDamper);
      this.vehicle.setWheelSuspensionRelaxation(index, this.tuning.suspensionDamper * 1.08);
      this.vehicle.setWheelMaxSuspensionForce(
        index,
        Math.max(9000, this.tuning.massKg * 12)
      );
      this.vehicle.setWheelFrictionSlip(index, this.tuning.tireGrip);
      this.vehicle.setWheelSideFrictionStiffness(index, 1.4);
    }

    const wheelGeometry = new THREE.BoxGeometry(0.42, 0.42, 0.25);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: "#181a1f" });

    for (const offset of wheelOffsets) {
      const mesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
      mesh.position.copy(offset);
      this.sceneGroup.add(mesh);
      this.wheelRuntimes.push({ mesh, baseOffset: offset.clone() });
    }
  }

  private setupVehicleVisual(): void {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.9, 4.4),
      this.bodyMaterial
    );
    body.position.y = 0.06;
    body.castShadow = true;
    this.sceneGroup.add(body);

    const cockpit = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.45, 1.7),
      this.cockpitMaterial
    );
    cockpit.position.set(0, 0.52, -0.1);
    this.sceneGroup.add(cockpit);
  }

  private configureWheelControl(
    wheelIndex: number,
    steering: number,
    engineForce: number,
    brakeForce: number,
    sideGripFactor: number
  ): void {
    this.vehicle.setWheelSteering(wheelIndex, steering);
    this.vehicle.setWheelEngineForce(wheelIndex, engineForce);
    this.vehicle.setWheelBrake(wheelIndex, brakeForce);
    this.vehicle.setWheelSideFrictionStiffness(wheelIndex, 1.25 * sideGripFactor);
  }

  private applyBoostImpulse(deltaSeconds: number): void {
    if (this.boostRemainingMs <= 0 || this.boostForce <= 0) {
      return;
    }

    const forward = this.getForwardVector(new THREE.Vector3());

    this.body.applyImpulse(
      {
        x: forward.x * this.boostForce * deltaSeconds,
        y: 0,
        z: forward.z * this.boostForce * deltaSeconds
      },
      true
    );
  }

  private syncVisuals(deltaSeconds: number): void {
    const position = this.body.translation();
    const rotation = this.body.rotation();

    this.sceneGroup.position.set(position.x, position.y, position.z);
    this.sceneGroup.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    const wheelRotationDelta = this.speedMs * deltaSeconds / Math.max(0.05, WHEEL_RADIUS);

    this.wheelRuntimes.forEach((wheel, index) => {
      const suspensionLength =
        this.vehicle.wheelSuspensionLength(index) ?? this.tuning.suspensionRest;

      wheel.mesh.position.set(
        wheel.baseOffset.x,
        wheel.baseOffset.y - (suspensionLength - this.tuning.suspensionRest),
        wheel.baseOffset.z
      );

      if (index <= 1) {
        wheel.mesh.rotation.y = this.steeringAngle;
      } else {
        wheel.mesh.rotation.y = 0;
      }

      wheel.mesh.rotation.x += wheelRotationDelta;
    });

    if (this.flyModeEnabled) {
      const pulse = 0.4 + (Math.sin(this.flightPulseSeconds * 5.5) + 1) * 0.25;
      const turboBoost = this.flightTurboEnabled ? 0.42 : 0;
      this.bodyMaterial.emissive.setHex(0x1e6dff);
      this.cockpitMaterial.emissive.setHex(0x4ec5ff);
      this.bodyMaterial.emissiveIntensity = pulse + turboBoost;
      this.cockpitMaterial.emissiveIntensity = pulse * 0.8 + turboBoost * 0.8;
      return;
    }

    this.bodyMaterial.emissiveIntensity = 0;
    this.cockpitMaterial.emissiveIntensity = 0;
  }

  private preStepFlight(input: InputState, deltaSeconds: number): void {
    this.appliedBrakeForce = 0;
    this.yawAssistTorque = 0;
    this.flightPulseSeconds += deltaSeconds;

    this.getForwardVector(this.workingForwardVector);
    this.getUpVector(this.workingUpVector);
    this.workingRightVector
      .crossVectors(this.workingForwardVector, this.workingUpVector)
      .normalize();

    const linvel = this.body.linvel();
    this.workingLinearVelocity.set(linvel.x, linvel.y, linvel.z);
    const speedKmh = this.workingLinearVelocity.length() * 3.6;

    const steeringInput = -input.steer;
    const steerRate = computeSteerRate(speedKmh, this.tuning);
    this.steeringAngle = steeringInput * steerRate;

    for (let wheelIndex = 0; wheelIndex < this.vehicle.numWheels(); wheelIndex += 1) {
      this.configureWheelControl(wheelIndex, 0, 0, 0, 0.65);
    }

    const turboForceScale = this.flightTurboEnabled ? FLY_TURBO_FORCE_MULTIPLIER : 1;
    const cruiseThrottle = Math.max(0.3, input.throttle);
    const forwardForce =
      this.tuning.engineForce *
      FLY_BASE_THRUST_MULTIPLIER *
      turboForceScale *
      (cruiseThrottle - input.brake * 0.46);
    const altitude = this.body.translation().y;
    const takeoffAssist = altitude < 3.2 ? this.tuning.massKg * 20 : 0;
    const hoverForce = this.tuning.massKg * 9.81 * FLY_BASE_LIFT_MULTIPLIER + takeoffAssist;
    const climbInput = (input.handbrake ? 1 : 0) - input.brake * 0.35;
    const climbForce =
      this.tuning.engineForce * FLY_CLIMB_FORCE_MULTIPLIER * climbInput * turboForceScale;
    const strafeForce = this.tuning.engineForce * FLY_STRAFE_FORCE_MULTIPLIER * steeringInput;
    const pulseLift = Math.sin(this.flightPulseSeconds * 6.5) * 220;

    this.body.applyImpulse(
      {
        x:
          (this.workingForwardVector.x * forwardForce +
            this.workingRightVector.x * strafeForce +
            WORLD_UP.x * (hoverForce + climbForce + pulseLift)) *
          deltaSeconds,
        y:
          (this.workingForwardVector.y * forwardForce +
            this.workingRightVector.y * strafeForce +
            WORLD_UP.y * (hoverForce + climbForce + pulseLift)) *
          deltaSeconds,
        z:
          (this.workingForwardVector.z * forwardForce +
            this.workingRightVector.z * strafeForce +
            WORLD_UP.z * (hoverForce + climbForce + pulseLift)) *
          deltaSeconds
      },
      true
    );

    const yawTorque = steeringInput * 28 * turboForceScale;
    const pitchTorque = (input.throttle - input.brake * 0.65) * 17 + (input.handbrake ? 6 : 0);
    const rollTorque = -steeringInput * 21;

    this.body.applyTorqueImpulse(
      {
        x:
          (this.workingRightVector.x * pitchTorque +
            WORLD_UP.x * yawTorque +
            this.workingForwardVector.x * rollTorque) *
          deltaSeconds,
        y:
          (this.workingRightVector.y * pitchTorque +
            WORLD_UP.y * yawTorque +
            this.workingForwardVector.y * rollTorque) *
          deltaSeconds,
        z:
          (this.workingRightVector.z * pitchTorque +
            WORLD_UP.z * yawTorque +
            this.workingForwardVector.z * rollTorque) *
          deltaSeconds
      },
      true
    );

    const postImpulseVelocity = this.body.linvel();
    this.workingLinearVelocity.set(postImpulseVelocity.x, postImpulseVelocity.y, postImpulseVelocity.z);
    const dragCoefficient = this.flightTurboEnabled ? FLY_DRAG_COEFFICIENT_TURBO : FLY_DRAG_COEFFICIENT;
    const drag = Math.exp(-dragCoefficient * deltaSeconds);
    this.body.setLinvel(
      {
        x: this.workingLinearVelocity.x * drag,
        y: this.workingLinearVelocity.y * Math.exp(-0.22 * deltaSeconds),
        z: this.workingLinearVelocity.z * drag
      },
      true
    );

    const angvel = this.body.angvel();
    this.workingAngularVelocity.set(angvel.x, angvel.y, angvel.z).multiplyScalar(0.985);
    this.body.setAngvel(
      {
        x: this.workingAngularVelocity.x,
        y: this.workingAngularVelocity.y,
        z: this.workingAngularVelocity.z
      },
      true
    );

    this.applyBoostImpulse(deltaSeconds);

    this.slipAngleDeg = computeSlipAngleDeg(
      { x: this.workingForwardVector.x, z: this.workingForwardVector.z },
      { x: this.workingLinearVelocity.x, z: this.workingLinearVelocity.z }
    );
    this.yawRate = this.body.angvel().y;
  }
}
