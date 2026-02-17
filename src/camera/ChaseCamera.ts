import * as THREE from "three";

export class ChaseCameraRig {
  private readonly smoothPosition = new THREE.Vector3();
  private readonly smoothLookTarget = new THREE.Vector3();
  private readonly smoothUp = new THREE.Vector3(0, 1, 0);

  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLookTarget = new THREE.Vector3();
  private readonly desiredUp = new THREE.Vector3(0, 1, 0);

  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private readonly normalizedForward = new THREE.Vector3();
  private readonly normalizedUp = new THREE.Vector3();
  private readonly followDistance = 8.4;
  private readonly followTightness = 8.5;
  private readonly lookTightness = 10;

  constructor(public readonly camera: THREE.PerspectiveCamera) {
    this.camera.fov = 80;
  }

  reset(targetPosition: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3): void {
    this.normalizedForward.copy(forward);
    if (this.normalizedForward.lengthSq() < 1e-4) {
      this.normalizedForward.set(0, 0, 1);
    }
    this.normalizedForward.normalize();

    this.normalizedUp.copy(up);
    if (this.normalizedUp.lengthSq() < 1e-4) {
      this.normalizedUp.copy(this.worldUp);
    }
    this.normalizedUp.normalize();

    this.desiredPosition
      .copy(targetPosition)
      .addScaledVector(this.normalizedUp, 2.8)
      .addScaledVector(this.normalizedForward, -this.followDistance);

    this.smoothPosition.copy(this.desiredPosition);

    this.desiredLookTarget
      .copy(targetPosition)
      .addScaledVector(this.normalizedForward, 5)
      .addScaledVector(this.normalizedUp, 1.2);
    this.smoothLookTarget.copy(this.desiredLookTarget);
    this.smoothUp.copy(this.normalizedUp);

    this.camera.position.copy(this.smoothPosition);
    this.camera.up.copy(this.smoothUp);
    this.camera.lookAt(this.smoothLookTarget);
  }

  update(
    targetPosition: THREE.Vector3,
    forward: THREE.Vector3,
    up: THREE.Vector3,
    speedKmh: number,
    deltaSeconds: number
  ): void {
    this.normalizedForward.copy(forward);
    if (this.normalizedForward.lengthSq() < 1e-4) {
      this.normalizedForward.set(0, 0, 1);
    }
    this.normalizedForward.normalize();

    this.normalizedUp.copy(up);
    if (this.normalizedUp.lengthSq() < 1e-4) {
      this.normalizedUp.copy(this.worldUp);
    }
    this.normalizedUp.normalize();

    const speedFactor = Math.min(1, speedKmh / 300);
    const dynamicDistance = this.followDistance + speedFactor * 1.8;
    const dynamicLookAhead = 4.5 + speedFactor * 4.5;

    this.desiredPosition
      .copy(targetPosition)
      .addScaledVector(this.normalizedUp, 2.8)
      .addScaledVector(this.normalizedForward, -dynamicDistance);

    this.desiredLookTarget
      .copy(targetPosition)
      .addScaledVector(this.normalizedForward, dynamicLookAhead)
      .addScaledVector(this.normalizedUp, 1.2 + speedFactor * 0.4);

    this.desiredUp.copy(this.normalizedUp);

    const followAlpha = 1 - Math.exp(-this.followTightness * deltaSeconds);
    const lookAlpha = 1 - Math.exp(-this.lookTightness * deltaSeconds);

    this.smoothPosition.lerp(this.desiredPosition, followAlpha);
    this.smoothLookTarget.lerp(this.desiredLookTarget, lookAlpha);
    this.smoothUp.lerp(this.desiredUp, lookAlpha).normalize();

    const targetFov = 78 + speedFactor * 18;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, followAlpha);
    this.camera.updateProjectionMatrix();

    this.camera.position.copy(this.smoothPosition);
    this.camera.up.copy(this.smoothUp);
    this.camera.lookAt(this.smoothLookTarget);
  }
}
