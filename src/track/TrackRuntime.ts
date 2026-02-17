import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { TrackDefinition, BoostPadDef, RespawnPose, Vec3 } from "../types";

type RapierWorld = import("@dimforge/rapier3d-compat").World;

interface CheckpointRuntime {
  id: string;
  order: number;
  bounds: THREE.Box3;
  mesh: THREE.Mesh;
}

interface BoostPadRuntime {
  definition: BoostPadDef;
  triggerBounds: THREE.Box3;
}

function vec3ToThree(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function buildSegmentQuaternion(rotation: {
  yaw: number;
  pitch: number;
  roll: number;
}): THREE.Quaternion {
  const euler = new THREE.Euler(rotation.pitch, rotation.yaw, rotation.roll, "YXZ");
  return new THREE.Quaternion().setFromEuler(euler);
}

export class TrackRuntime {
  readonly sceneGroup = new THREE.Group();

  private readonly checkpoints: CheckpointRuntime[] = [];
  private readonly boostPads: BoostPadRuntime[] = [];

  constructor(
    private readonly world: RapierWorld,
    private readonly scene: THREE.Scene,
    public readonly definition: TrackDefinition
  ) {
    this.sceneGroup.name = "track-runtime";
    this.scene.add(this.sceneGroup);
    this.buildVisualAndCollisionTrack();
  }

  getSpawnPose(): RespawnPose {
    return {
      position: [...this.definition.spawn.position],
      yaw: this.definition.spawn.yaw
    };
  }

  getCheckpointOrdersAtPosition(position: THREE.Vector3): number[] {
    const orders: number[] = [];
    for (const checkpoint of this.checkpoints) {
      if (checkpoint.bounds.containsPoint(position)) {
        orders.push(checkpoint.order);
      }
    }
    return orders;
  }

  getBoostPadsAtPosition(position: THREE.Vector3): BoostPadDef[] {
    const hits: BoostPadDef[] = [];
    for (const boostPad of this.boostPads) {
      if (boostPad.triggerBounds.containsPoint(position)) {
        hits.push(boostPad.definition);
      }
    }
    return hits;
  }

  highlightCheckpoint(order: number): void {
    const checkpoint = this.checkpoints.find((candidate) => candidate.order === order);
    if (!checkpoint) {
      return;
    }

    checkpoint.mesh.material = new THREE.MeshBasicMaterial({
      color: "#22f091",
      wireframe: true,
      transparent: true,
      opacity: 0.72
    });

    window.setTimeout(() => {
      checkpoint.mesh.material = new THREE.MeshBasicMaterial({
        color: "#5bc6ff",
        wireframe: true,
        transparent: true,
        opacity: 0.5
      });
    }, 180);
  }

  private buildVisualAndCollisionTrack(): void {
    const ambientGround = RAPIER.ColliderDesc.cuboid(650, 1, 650)
      .setTranslation(0, -12, 0)
      .setFriction(1.0)
      .setRestitution(0);
    this.world.createCollider(ambientGround);

    const trackMaterial = new THREE.MeshStandardMaterial({
      color: "#39465f",
      metalness: 0.15,
      roughness: 0.7
    });

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: "#9bc4d7",
      metalness: 0.22,
      roughness: 0.4
    });

    for (const segment of this.definition.segments) {
      const [width, height, length] = segment.size;
      const segmentGeometry = new THREE.BoxGeometry(width, height, length);
      const segmentMesh = new THREE.Mesh(segmentGeometry, trackMaterial.clone());
      const segmentQuaternion = buildSegmentQuaternion(segment.rotation);

      if (segment.colorHex !== undefined) {
        (segmentMesh.material as THREE.MeshStandardMaterial).color.setHex(segment.colorHex);
      }

      segmentMesh.position.fromArray(segment.position);
      segmentMesh.quaternion.copy(segmentQuaternion);
      segmentMesh.castShadow = true;
      segmentMesh.receiveShadow = true;
      this.sceneGroup.add(segmentMesh);

      const colliderDesc = RAPIER.ColliderDesc.cuboid(
        width / 2,
        height / 2,
        length / 2
      )
        .setTranslation(segment.position[0], segment.position[1], segment.position[2])
        .setRotation(
          new RAPIER.Quaternion(
            segmentQuaternion.x,
            segmentQuaternion.y,
            segmentQuaternion.z,
            segmentQuaternion.w
          )
        )
        .setFriction(1.8)
        .setRestitution(0.0);

      this.world.createCollider(colliderDesc);

      const edgeHeight = 1.1;
      const edgeThickness = 0.45;
      const edgeDistanceFromCenter = width * 0.5 + edgeThickness * 0.5;
      const railMode = segment.railMode ?? "both";
      const edgeSides =
        railMode === "both" ? [-1, 1] : railMode === "left" ? [-1] : railMode === "right" ? [1] : [];

      for (const side of edgeSides) {
        const localOffset = new THREE.Vector3(side * edgeDistanceFromCenter, edgeHeight / 2, 0);
        localOffset.applyQuaternion(segmentQuaternion);

        const edgeCenter = vec3ToThree(segment.position)
          .add(localOffset)
          .toArray() as Vec3;

        const edgeGeometry = new THREE.BoxGeometry(edgeThickness, edgeHeight, length);
        const edgeMesh = new THREE.Mesh(edgeGeometry, edgeMaterial);
        edgeMesh.position.fromArray(edgeCenter);
        edgeMesh.quaternion.copy(segmentQuaternion);
        this.sceneGroup.add(edgeMesh);

        const edgeCollider = RAPIER.ColliderDesc.cuboid(
          edgeThickness / 2,
          edgeHeight / 2,
          length / 2
        )
          .setTranslation(edgeCenter[0], edgeCenter[1], edgeCenter[2])
          .setRotation(
            new RAPIER.Quaternion(
              segmentQuaternion.x,
              segmentQuaternion.y,
              segmentQuaternion.z,
              segmentQuaternion.w
            )
          )
          .setFriction(0.9)
          .setRestitution(0.0);

        this.world.createCollider(edgeCollider);
      }
    }

    for (const checkpoint of this.definition.checkpoints) {
      const size = vec3ToThree(checkpoint.size);
      const center = vec3ToThree(checkpoint.position);

      const bounds = new THREE.Box3().setFromCenterAndSize(center, size);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        new THREE.MeshBasicMaterial({
          color: "#5bc6ff",
          wireframe: true,
          transparent: true,
          opacity: 0.5
        })
      );

      mesh.position.copy(center);
      this.sceneGroup.add(mesh);

      this.checkpoints.push({
        id: checkpoint.id,
        order: checkpoint.order,
        bounds,
        mesh
      });
    }

    const boostMaterial = new THREE.MeshStandardMaterial({
      color: "#ff9f1a",
      emissive: "#ff6b00",
      emissiveIntensity: 0.75,
      metalness: 0.08,
      roughness: 0.45
    });

    for (const boostPad of this.definition.boostPads) {
      const size = vec3ToThree(boostPad.size);
      const center = vec3ToThree(boostPad.position);
      const triggerSize = size.clone();
      triggerSize.x *= 1.15;
      triggerSize.z *= 1.2;
      triggerSize.y = Math.max(triggerSize.y, 3.2);

      const triggerBounds = new THREE.Box3().setFromCenterAndSize(center, triggerSize);

      const boostMesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        boostMaterial
      );
      boostMesh.position.copy(center);
      this.sceneGroup.add(boostMesh);

      this.boostPads.push({
        definition: boostPad,
        triggerBounds
      });
    }

    const skySphere = new THREE.Mesh(
      new THREE.SphereGeometry(950, 30, 30),
      new THREE.MeshBasicMaterial({
        color: "#7fc6eb",
        side: THREE.BackSide
      })
    );
    this.sceneGroup.add(skySphere);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1300, 1300),
      new THREE.MeshStandardMaterial({
        color: "#294a33",
        roughness: 1,
        metalness: 0
      })
    );
    floor.rotation.x = -Math.PI * 0.5;
    floor.position.y = -11;
    floor.receiveShadow = true;
    this.sceneGroup.add(floor);
  }
}
