/** Mild pendulum sway during hold phase (deterministic per frame). */
export type HoldShake = {
  rotationDeg: number;
  pivotFromTop: boolean;
};

/** ~0.7 swings per second — slow, gentle pendulum */
const PENDULUM_HZ = 0.7;

/**
 * @param intensity 0 = off, 1 = default mild, up to 2 = slightly more sway
 */
export function computeHoldShake(
  holdFrameIndex: number,
  fps: number,
  intensity: number
): HoldShake {
  if (intensity <= 0) {
    return { rotationDeg: 0, pivotFromTop: false };
  }

  const t = holdFrameIndex / fps;
  const swing = Math.sin(t * PENDULUM_HZ * Math.PI * 2);

  // Very small angle: ~±0.2° at intensity 1, ~±0.4° at 2
  const rotationDeg = swing * 0.2 * intensity;

  return { rotationDeg, pivotFromTop: true };
}
