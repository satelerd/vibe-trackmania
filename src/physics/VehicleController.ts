import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { InputState, RespawnPose, VehicleTelemetry, VehicleTuning } from "../types";

type RapierWorld = import("@dimforge/rapier3d-compat").World;
type RapierRigidBody = import("@dimforge/rapier3d-compat").RigidBody;
type RapierVehicleController = import("@dimforge/rapier3d-compat").DynamicRayCastVehicleController;

interface WheelRuntime {
  mesh: THREE.Mesh;
  baseOffset: THREE.Vector3;
}

const WHEEL_RADIUS = 0.43;

export class VehicleController {
  readonly sceneGroup = new THREE.Group();

  private readonly body: RapierRigidBody;
  private readonly vehicle: RapierVehicleController;
  private readonly wheelRuntimes: WheelRuntime[] = [];

  private boostRemainingMs = 0;
  private boostForce = 0;

  private steeringAngle = 0;
  private speedMs = 0;
  private grounded = false;

  private readonly forwardVector = new THREE.Vector3(0, 0, 1);
  private readonly workingQuaternion = new THREE.Quaternion();
  private readonly workingVector2 = new THREE.Vector2();

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

    const chassisCollider = RAPIER.ColliderDesc.cuboid(1.03, 0.4, 2.15)
      .setTranslation(0, -0.2, 0)
      .setDensity(Math.max(0.1, this.tuning.massKg / 2.2))
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
    const steerSpeedFactor = THREE.MathUtils.clamp(1 - Math.abs(this.speedMs) / 90, 0.35, 1);
    this.steeringAngle = input.steer * this.tuning.steerRate * steerSpeedFactor;

    const throttleForce = input.throttle * this.tuning.engineForce;
    const brakeForce =
      input.brake * this.tuning.brakeForce +
      (input.handbrake ? this.tuning.brakeForce * 0.72 : 0);

    const rearGrip = input.handbrake ? this.tuning.driftGripFactorRear : 1;

    this.configureWheelControl(0, this.steeringAngle, throttleForce, brakeForce, 1);
    this.configureWheelControl(1, this.steeringAngle, throttleForce, brakeForce, 1);
    this.configureWheelControl(2, 0, throttleForce, brakeForce, rearGrip);
    this.configureWheelControl(3, 0, throttleForce, brakeForce, rearGrip);

    this.applyBoostImpulse(deltaSeconds);

    if (!this.grounded) {
      this.body.applyTorqueImpulse(
        {
          x: 0,
          y: input.steer * this.tuning.airControlTorque * deltaSeconds,
          z: 0
        },
        true
      );
    }

    this.body.applyTorqueImpulse(
      {
        x: -this.body.angvel().x * 0.03,
        y: -this.body.angvel().y * 0.04,
        z: -this.body.angvel().z * 0.03
      },
      true
    );

    this.vehicle.updateVehicle(deltaSeconds);
  }

  postStep(deltaSeconds: number): void {
    this.grounded = false;
    for (let wheelIndex = 0; wheelIndex < this.vehicle.numWheels(); wheelIndex += 1) {
      if (this.vehicle.wheelIsInContact(wheelIndex)) {
        this.grounded = true;
        break;
      }
    }

    const bodyVelocity = this.body.linvel();
    this.workingVector2.set(bodyVelocity.x, bodyVelocity.z);

    const horizontalSpeed = this.workingVector2.length();
    this.speedMs = this.vehicle.currentVehicleSpeed();

    const maxSpeedMs = this.tuning.maxSpeedKmh / 3.6;
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

  getTelemetry(): VehicleTelemetry {
    return {
      speedKmh: Math.abs(this.speedMs) * 3.6,
      isGrounded: this.grounded,
      boostRemainingMs: this.boostRemainingMs
    };
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
      this.vehicle.setWheelMaxSuspensionForce(index, 1900);
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
      new THREE.MeshStandardMaterial({
        color: "#ff5d2f",
        metalness: 0.42,
        roughness: 0.31
      })
    );
    body.position.y = 0.06;
    body.castShadow = true;
    this.sceneGroup.add(body);

    const cockpit = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.45, 1.7),
      new THREE.MeshStandardMaterial({
        color: "#b7d9f0",
        metalness: 0.8,
        roughness: 0.12
      })
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
  }
}
