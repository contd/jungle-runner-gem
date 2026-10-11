/**
 * Render-consistent pendulum coordinates. Phaser positive rotation turns a
 * downward-pointing sprite toward negative X, not positive X.
 * @module game/systems/vineGeometry
 */

/** Geometry shared by visual tip positioning and attachment detection. */
export interface VineGeometry {
  /** World anchor X in pixels. */
  anchorX: number;
  /** World anchor Y in pixels. */
  anchorY: number;
  /** Rendered vine length in pixels. */
  length: number;
  /** Phaser clockwise rotation in radians. */
  angle: number;
}

/** Exact rotated bottom-center of a top-origin, downward-pointing vine sprite. */
export function vineTip(vine: VineGeometry): {
  /** World X in pixels. */
  x: number;
  /** World Y in pixels. */
  y: number;
} {
  return {
    x: vine.anchorX - Math.sin(vine.angle) * vine.length,
    y: vine.anchorY + Math.cos(vine.angle) * vine.length
  };
}
