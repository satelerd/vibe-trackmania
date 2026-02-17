import * as THREE from "three";

export class ChaseCameraRig {
  private readonly smoothPosition = new THREE.Vector3();
  private readonly smoothLookTarget = new THREE.Vector3();

  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLookTarget = new THREE.Vector3();

  private readonly upOffset = new THREE.Vector3(0, 2.8, 0);

  private readonly followDistance = 8.4;
  private readonly followTightness = 8.5;
  private readonly lookTightness = 10;

  constructor(public readonly camera: THREE.PerspectiveCamera) {
    this.camera.fov = 80;
  }

  reset(targetPosition: THREE.Vector3, forward: THREE.Vector3): void {
    this.desiredPosition
      .copy(targetPosition)
      .add(this.upOffset)
      .addScaledVector(forward, -this.followDistance);

    this.smoothPosition.copy(this.desiredPosition);

    this.desiredLookTarget.copy(targetPosition).addScaledVector(forward, 5);
    this.smoothLookTarget.copy(this.desiredLookTarget);

    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(this.smoothLookTarget);
  }

  update(
    targetPosition: THREE.Vector3,
    forward: THREE.Vector3,
    speedKmh: number,
    deltaSeconds: number
  ): void {
    const horizontalForward = new THREE.Vector3(forward.x, 0, forward.z);
    if (horizontalForward.lengthSq() < 1e-4) {
      horizontalForward.set(0, 0, 1);
    }
    horizontalForward.normalize();

    const speedFactor = Math.min(1, speedKmh / 300);
    const dynamicDistance = this.followDistance + speedFactor * 1.8;
    const dynamicLookAhead = 4.5 + speedFactor * 4.5;

    this.desiredPosition
      .copy(targetPosition)
      .add(this.upOffset)
      .addScaledVector(horizontalForward, -dynamicDistance);

    this.desiredLookTarget
      .copy(targetPosition)
      .addScaledVector(horizontalForward, dynamicLookAhead)
      .add(new THREE.Vector3(0, 1.2, 0));

    const followAlpha = 1 - Math.exp(-this.followTightness * deltaSeconds);
    const lookAlpha = 1 - Math.exp(-this.lookTightness * deltaSeconds);

    this.smoothPosition.lerp(this.desiredPosition, followAlpha);
    this.smoothLookTarget.lerp(this.desiredLookTarget, lookAlpha);

    const targetFov = 78 + speedFactor * 18;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, followAlpha);
    this.camera.updateProjectionMatrix();

    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(this.smoothLookTarget);
  }
}
