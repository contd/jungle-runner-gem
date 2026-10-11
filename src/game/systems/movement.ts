/**
 * Shared native/frontend movement tuning and conservative terrain reach.
 * Gravity combines world and player acceleration; gap limits assume a single
 * jump at minimum speed, never requiring the optional airborne boost.
 * @module game/systems/movement
 */
import tuning from '../../../src-tauri/src/game/movement.json';
import pacing from '../../../src-tauri/src/game/pacing.json';

/** Shared staged introduction and later difficulty thresholds, in game meters. */
export interface WorldPacing {
  /** Guaranteed hazard-free selection interval. */
  safeStartMeters: number;
  /** Only safe/log recipes are eligible before this distance. */
  warmupMeters: number;
  /** First advanced hazard tier. */
  tier2Meters: number;
  /** First temple tier. */
  tier3Meters: number;
  /** First gauntlet tier. */
  tier4Meters: number;
  /** Speed remains constant until this distance. */
  speedRampStartMeters: number;
}
/** Authoritative progression shared by browser selection, Rust and scene speed. */
export const WORLD_PACING: WorldPacing = pacing;

/** Serialized tuning shared by native gap validation and frontend physics. */
export interface MovementTuning {
  /** World acceleration in pixels/second squared. */
  worldGravity: number;
  /** Additional player-body acceleration in pixels/second squared. */
  playerGravity: number;
  /** Initial upward ground-jump speed in pixels/second. */
  jumpVelocity: number;
  /** One-shot additional upward velocity; falling motion is cancelled first. */
  boostVelocity: number;
  /** Minimum ordinary forward speed used to calculate jump reach. */
  minimumRunSpeed: number;
  /** Conservative landing reserve subtracted from same-height flight distance. */
  landingMargin: number;
  /** Terrain raster cell width in pixels. */
  tileWidth: number;
  /** Upward speed imparted by bouncing on a crocodile. */
  crocodileBounceVelocity: number;
}

/** Authoritative movement values in pixels, seconds and pixels/second squared. */
export const MOVEMENT: MovementTuning = tuning;
/** Constant opening speed, then the existing gradual increase capped at 130 pixels/second. */
export function runSpeedAtDistance(distance: number): number {
  return MOVEMENT.minimumRunSpeed
    + Math.min(130, Math.max(0, distance - WORLD_PACING.speedRampStartMeters) * 0.07);
}
/** Conservative same-height single-jump gap limit, rounded down to whole terrain tiles. */
export const MAX_JUMP_GAP = Math.floor(
  (2 * tuning.jumpVelocity * tuning.minimumRunSpeed
    / (tuning.worldGravity + tuning.playerGravity) - tuning.landingMargin) / tuning.tileWidth
) * tuning.tileWidth;
