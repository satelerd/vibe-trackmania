import { RespawnPose, TrackDefinition } from "../types";

function yawFromPoints(from: [number, number, number], to: [number, number, number]): number {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  return Math.atan2(dx, dz);
}

export function resolveRespawnPose(
  track: TrackDefinition,
  lastCheckpointOrder: number
): RespawnPose {
  if (lastCheckpointOrder < 0) {
    return {
      position: [...track.spawn.position],
      yaw: track.spawn.yaw
    };
  }

  const checkpoint = track.checkpoints.find(
    (candidate) => candidate.order === lastCheckpointOrder
  );

  if (!checkpoint) {
    return {
      position: [...track.spawn.position],
      yaw: track.spawn.yaw
    };
  }

  const nextCheckpoint = track.checkpoints.find(
    (candidate) => candidate.order === lastCheckpointOrder + 1
  );
  const previousCheckpoint = track.checkpoints.find(
    (candidate) => candidate.order === Math.max(0, lastCheckpointOrder - 1)
  );

  let yaw = track.spawn.yaw;

  if (nextCheckpoint) {
    yaw = yawFromPoints(checkpoint.position, nextCheckpoint.position);
  } else if (previousCheckpoint && previousCheckpoint.id !== checkpoint.id) {
    yaw = yawFromPoints(previousCheckpoint.position, checkpoint.position);
  }

  return {
    position: [
      checkpoint.position[0],
      checkpoint.position[1] + 2.1,
      checkpoint.position[2]
    ],
    yaw
  };
}
