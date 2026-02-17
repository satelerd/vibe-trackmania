import { SegmentRailMode, TrackDefinition, Vec3 } from "../types";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((component) => isFiniteNumber(component));

const VALID_RAIL_MODES: SegmentRailMode[] = ["both", "left", "right", "none"];

const isSegmentRotation = (
  value: unknown
): value is { yaw: number; pitch: number; roll: number } =>
  typeof value === "object" &&
  value !== null &&
  isFiniteNumber((value as { yaw?: unknown }).yaw) &&
  isFiniteNumber((value as { pitch?: unknown }).pitch) &&
  isFiniteNumber((value as { roll?: unknown }).roll);

const isRailMode = (value: unknown): value is SegmentRailMode =>
  typeof value === "string" && VALID_RAIL_MODES.includes(value as SegmentRailMode);

export function collectTrackValidationErrors(track: TrackDefinition): string[] {
  const errors: string[] = [];

  if (!track.id.trim()) {
    errors.push("track.id no puede estar vacío");
  }

  if (!track.name.trim()) {
    errors.push("track.name no puede estar vacío");
  }

  if (!isVec3(track.spawn.position)) {
    errors.push("spawn.position debe ser Vec3");
  }

  if (!isFiniteNumber(track.spawn.yaw)) {
    errors.push("spawn.yaw debe ser numérico");
  }

  if (track.segments.length === 0) {
    errors.push("segments debe incluir al menos 1 segmento");
  }

  const segmentIds = new Set<string>();
  for (const segment of track.segments) {
    if (!segment.id.trim()) {
      errors.push("cada segmento requiere id");
    }

    if (segmentIds.has(segment.id)) {
      errors.push(`segment id duplicado: ${segment.id}`);
    }

    segmentIds.add(segment.id);

    if (!isVec3(segment.position)) {
      errors.push(`segment ${segment.id}: position inválido`);
    }

    if (!isVec3(segment.size) || segment.size.some((value) => value <= 0)) {
      errors.push(`segment ${segment.id}: size debe ser Vec3 positivo`);
    }

    if (!isSegmentRotation(segment.rotation)) {
      errors.push(`segment ${segment.id}: rotation inválida`);
    }

    if (segment.railMode !== undefined && !isRailMode(segment.railMode)) {
      errors.push(
        `segment ${segment.id}: railMode inválido (válidos: ${VALID_RAIL_MODES.join(", ")})`
      );
    }
  }

  if (track.checkpoints.length === 0) {
    errors.push("checkpoints debe incluir al menos 1 checkpoint");
  }

  const checkpointIds = new Set<string>();
  const ordered = [...track.checkpoints].sort((a, b) => a.order - b.order);

  for (const checkpoint of track.checkpoints) {
    if (!checkpoint.id.trim()) {
      errors.push("cada checkpoint requiere id");
    }

    if (checkpointIds.has(checkpoint.id)) {
      errors.push(`checkpoint id duplicado: ${checkpoint.id}`);
    }

    checkpointIds.add(checkpoint.id);

    if (!isVec3(checkpoint.position)) {
      errors.push(`checkpoint ${checkpoint.id}: position inválido`);
    }

    if (!isVec3(checkpoint.size) || checkpoint.size.some((value) => value <= 0)) {
      errors.push(`checkpoint ${checkpoint.id}: size debe ser Vec3 positivo`);
    }

    if (!Number.isInteger(checkpoint.order) || checkpoint.order < 0) {
      errors.push(`checkpoint ${checkpoint.id}: order debe ser entero >= 0`);
    }
  }

  for (let expectedOrder = 0; expectedOrder < ordered.length; expectedOrder += 1) {
    if (ordered[expectedOrder]?.order !== expectedOrder) {
      errors.push(
        "checkpoint orders deben ser secuenciales y sin huecos (0..n-1)"
      );
      break;
    }
  }

  const boostIds = new Set<string>();
  for (const boost of track.boostPads) {
    if (!boost.id.trim()) {
      errors.push("cada boost pad requiere id");
    }

    if (boostIds.has(boost.id)) {
      errors.push(`boost id duplicado: ${boost.id}`);
    }

    boostIds.add(boost.id);

    if (!isVec3(boost.position)) {
      errors.push(`boost ${boost.id}: position inválido`);
    }

    if (!isVec3(boost.size) || boost.size.some((value) => value <= 0)) {
      errors.push(`boost ${boost.id}: size debe ser Vec3 positivo`);
    }

    if (!isFiniteNumber(boost.force) || boost.force <= 0) {
      errors.push(`boost ${boost.id}: force debe ser > 0`);
    }

    if (!Number.isInteger(boost.durationMs) || boost.durationMs <= 0) {
      errors.push(`boost ${boost.id}: durationMs debe ser entero > 0`);
    }
  }

  return errors;
}

export function validateTrackDefinition(track: TrackDefinition): TrackDefinition {
  const errors = collectTrackValidationErrors(track);
  if (errors.length > 0) {
    throw new Error(`TrackDefinition inválido:\n- ${errors.join("\n- ")}`);
  }

  return track;
}
