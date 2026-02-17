export function applyBoostImpulse(
  currentSpeedMs: number,
  force: number,
  durationMs: number,
  massKg: number
): number {
  const safeMass = Math.max(1, massKg);
  const impulse = force * (durationMs / 1000);
  const speedDelta = impulse / safeMass;
  return currentSpeedMs + speedDelta;
}
