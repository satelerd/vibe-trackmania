import * as THREE from "three";
import {
  SegmentRailMode,
  TrackSegmentDef,
  Vec3
} from "../types";

interface SegmentBuildOptions {
  colorHex?: number;
  railMode?: SegmentRailMode;
  stepLength?: number;
  thickness?: number;
  width?: number;
}

interface ArcBuildOptions extends SegmentBuildOptions {
  bankDeg?: number;
  steps?: number;
}

interface PitchArcBuildOptions extends SegmentBuildOptions {
  steps?: number;
}

interface JumpBuildOptions extends SegmentBuildOptions {
  gapLength: number;
  landingLength: number;
  landingPitchDeg: number;
  rampLength: number;
  rampPitchDeg: number;
}

interface PathSample {
  distance: number;
  forward: THREE.Vector3;
  position: THREE.Vector3;
  up: THREE.Vector3;
}

export interface TrackBuilderOptions {
  baseSegmentThickness?: number;
  baseSegmentWidth?: number;
  idPrefix?: string;
  startPosition?: Vec3;
  startYaw?: number;
}

export interface TrackPathSample {
  forward: Vec3;
  position: Vec3;
  up: Vec3;
  yaw: number;
}

const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);

function toVec3(vector: THREE.Vector3): Vec3 {
  return [vector.x, vector.y, vector.z];
}

function quaternionToRotation(
  quaternion: THREE.Quaternion
): { yaw: number; pitch: number; roll: number } {
  const euler = new THREE.Euler(0, 0, 0, "YXZ").setFromQuaternion(quaternion, "YXZ");
  return {
    yaw: euler.y,
    pitch: euler.x,
    roll: euler.z
  };
}

export function measureAdjacentSegmentGaps(segments: TrackSegmentDef[]): number[] {
  const gaps: number[] = [];

  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const forwardA = new THREE.Vector3();
  const forwardB = new THREE.Vector3();
  const orientation = new THREE.Quaternion();

  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];

    orientation.setFromEuler(
      new THREE.Euler(current.rotation.pitch, current.rotation.yaw, current.rotation.roll, "YXZ")
    );
    forwardA.copy(LOCAL_FORWARD).applyQuaternion(orientation).normalize();
    end
      .fromArray(current.position)
      .addScaledVector(forwardA, current.size[2] * 0.5);

    orientation.setFromEuler(
      new THREE.Euler(next.rotation.pitch, next.rotation.yaw, next.rotation.roll, "YXZ")
    );
    forwardB.copy(LOCAL_FORWARD).applyQuaternion(orientation).normalize();
    start
      .fromArray(next.position)
      .addScaledVector(forwardB, -next.size[2] * 0.5);

    gaps.push(end.distanceTo(start));
  }

  return gaps;
}

export class TrackBuilder {
  private readonly baseSegmentThickness: number;
  private readonly baseSegmentWidth: number;
  private readonly idPrefix: string;
  private readonly pathSamples: PathSample[] = [];
  private readonly segments: TrackSegmentDef[] = [];

  private readonly currentForward = new THREE.Vector3();
  private readonly currentUp = new THREE.Vector3();
  private readonly rotationDelta = new THREE.Quaternion();

  private cumulativeDistance = 0;
  private segmentCounter = 0;
  private readonly cursorPosition = new THREE.Vector3();
  private readonly cursorOrientation = new THREE.Quaternion();

  constructor(options: TrackBuilderOptions = {}) {
    this.baseSegmentWidth = options.baseSegmentWidth ?? 18;
    this.baseSegmentThickness = options.baseSegmentThickness ?? 1;
    this.idPrefix = options.idPrefix ?? "track-seg";

    const startPosition = options.startPosition ?? [0, 0, 0];
    this.cursorPosition.fromArray(startPosition);
    this.cursorOrientation.setFromAxisAngle(LOCAL_UP, options.startYaw ?? 0);

    this.pushPathSample();
  }

  addStraight(length: number, options: SegmentBuildOptions = {}): this {
    if (length <= 0) {
      return this;
    }

    const stepLength = options.stepLength ?? 6;
    const steps = Math.max(1, Math.ceil(length / Math.max(0.2, stepLength)));
    const pieceLength = length / steps;

    for (let index = 0; index < steps; index += 1) {
      this.pushSegment(pieceLength, options);
    }

    return this;
  }

  addYawArc(radius: number, angleDeg: number, options: ArcBuildOptions = {}): this {
    if (radius <= 0 || angleDeg === 0) {
      return this;
    }

    const yawRadians = THREE.MathUtils.degToRad(angleDeg);
    const arcLength = Math.abs(radius * yawRadians);
    const steps =
      options.steps ??
      Math.max(3, Math.ceil(arcLength / Math.max(0.15, options.stepLength ?? 3.4)));
    const yawStep = yawRadians / steps;
    const segmentLength = arcLength / steps;
    const bankStep = THREE.MathUtils.degToRad(options.bankDeg ?? 0) / steps;

    for (let index = 0; index < steps; index += 1) {
      this.rotateLocal(LOCAL_UP, yawStep * 0.5);
      if (Math.abs(bankStep) > 0.0000001) {
        this.rotateLocal(LOCAL_FORWARD, bankStep);
      }
      this.pushSegment(segmentLength, options);
      this.rotateLocal(LOCAL_UP, yawStep * 0.5);
    }

    return this;
  }

  addPitchArc(radius: number, angleDeg: number, options: PitchArcBuildOptions = {}): this {
    if (radius <= 0 || angleDeg === 0) {
      return this;
    }

    const pitchRadians = THREE.MathUtils.degToRad(-angleDeg);
    const arcLength = Math.abs(radius * pitchRadians);
    const steps =
      options.steps ??
      Math.max(4, Math.ceil(arcLength / Math.max(0.15, options.stepLength ?? 3.2)));
    const pitchStep = pitchRadians / steps;
    const segmentLength = arcLength / steps;

    for (let index = 0; index < steps; index += 1) {
      this.rotateLocal(LOCAL_RIGHT, pitchStep * 0.5);
      this.pushSegment(segmentLength, options);
      this.rotateLocal(LOCAL_RIGHT, pitchStep * 0.5);
    }

    return this;
  }

  addJump(options: JumpBuildOptions): this {
    const stepLength = options.stepLength ?? 3.2;
    const rampSteps = Math.max(1, Math.ceil(options.rampLength / Math.max(0.2, stepLength)));
    const rampPitchStep = THREE.MathUtils.degToRad(-options.rampPitchDeg) / rampSteps;
    const rampSegmentLength = options.rampLength / rampSteps;

    for (let index = 0; index < rampSteps; index += 1) {
      this.rotateLocal(LOCAL_RIGHT, rampPitchStep);
      this.pushSegment(rampSegmentLength, options);
    }

    this.advanceGap(options.gapLength);

    const landingSteps = Math.max(1, Math.ceil(options.landingLength / Math.max(0.2, stepLength)));
    const landingPitchStep = THREE.MathUtils.degToRad(-options.landingPitchDeg) / landingSteps;
    const landingSegmentLength = options.landingLength / landingSteps;

    for (let index = 0; index < landingSteps; index += 1) {
      this.rotateLocal(LOCAL_RIGHT, landingPitchStep);
      this.pushSegment(landingSegmentLength, options);
    }

    return this;
  }

  samplePathAt(distance: number): TrackPathSample {
    const clampedDistance = THREE.MathUtils.clamp(distance, 0, this.cumulativeDistance);
    if (this.pathSamples.length === 1) {
      const single = this.pathSamples[0];
      return {
        position: toVec3(single.position),
        forward: toVec3(single.forward),
        up: toVec3(single.up),
        yaw: Math.atan2(single.forward.x, single.forward.z)
      };
    }

    for (let index = 1; index < this.pathSamples.length; index += 1) {
      const previous = this.pathSamples[index - 1];
      const next = this.pathSamples[index];
      if (clampedDistance > next.distance) {
        continue;
      }

      const span = Math.max(0.000001, next.distance - previous.distance);
      const alpha = (clampedDistance - previous.distance) / span;

      const position = previous.position.clone().lerp(next.position, alpha);
      const forward = previous.forward.clone().lerp(next.forward, alpha);
      if (forward.lengthSq() < 0.000001) {
        forward.copy(next.forward);
      }
      forward.normalize();

      const up = previous.up.clone().lerp(next.up, alpha);
      if (up.lengthSq() < 0.000001) {
        up.copy(next.up);
      }
      up.normalize();

      return {
        position: toVec3(position),
        forward: toVec3(forward),
        up: toVec3(up),
        yaw: Math.atan2(forward.x, forward.z)
      };
    }

    const tail = this.pathSamples[this.pathSamples.length - 1];
    return {
      position: toVec3(tail.position),
      forward: toVec3(tail.forward),
      up: toVec3(tail.up),
      yaw: Math.atan2(tail.forward.x, tail.forward.z)
    };
  }

  getTotalDistance(): number {
    return this.cumulativeDistance;
  }

  buildSegments(): TrackSegmentDef[] {
    return this.segments.map((segment) => ({
      ...segment,
      position: [...segment.position],
      size: [...segment.size],
      rotation: { ...segment.rotation }
    }));
  }

  private pushSegment(length: number, options: SegmentBuildOptions): void {
    if (length <= 0) {
      return;
    }

    this.currentForward.copy(LOCAL_FORWARD).applyQuaternion(this.cursorOrientation).normalize();
    const center = this.cursorPosition.clone().addScaledVector(this.currentForward, length * 0.5);

    this.segments.push({
      id: `${this.idPrefix}-${this.segmentCounter.toString().padStart(3, "0")}`,
      position: toVec3(center),
      size: [
        options.width ?? this.baseSegmentWidth,
        options.thickness ?? this.baseSegmentThickness,
        length
      ],
      rotation: quaternionToRotation(this.cursorOrientation),
      colorHex: options.colorHex,
      railMode: options.railMode
    });

    this.segmentCounter += 1;
    this.cursorPosition.addScaledVector(this.currentForward, length);
    this.cumulativeDistance += length;
    this.pushPathSample();
  }

  private advanceGap(length: number): void {
    if (length <= 0) {
      return;
    }

    this.currentForward.copy(LOCAL_FORWARD).applyQuaternion(this.cursorOrientation).normalize();
    this.cursorPosition.addScaledVector(this.currentForward, length);
    this.cumulativeDistance += length;
    this.pushPathSample();
  }

  private rotateLocal(localAxis: THREE.Vector3, radians: number): void {
    if (radians === 0) {
      return;
    }

    this.rotationDelta.setFromAxisAngle(localAxis, radians);
    this.cursorOrientation.multiply(this.rotationDelta).normalize();
  }

  private pushPathSample(): void {
    this.currentForward.copy(LOCAL_FORWARD).applyQuaternion(this.cursorOrientation).normalize();
    this.currentUp.copy(LOCAL_UP).applyQuaternion(this.cursorOrientation).normalize();

    this.pathSamples.push({
      distance: this.cumulativeDistance,
      position: this.cursorPosition.clone(),
      forward: this.currentForward.clone(),
      up: this.currentUp.clone()
    });
  }
}
