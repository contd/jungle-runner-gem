/**
 * Serializable world-planning contracts shared by the native worker and scene.
 * Coordinates are chunk-local virtual pixels; no Phaser objects cross IPC.
 * @module game/systems/worldTypes
 */

/** Preferred biome and authored recipe biome identities. */
export type BiomeType = 'canopy' | 'swamp' | 'temple' | 'cavern';
/** Terrain, hazards, and traversal helpers understood by the scene. */
export type ObstacleType = 'pit' | 'water_lagoon' | 'crocodile' | 'log' | 'overhead_branch'
  | 'swing_vine' | 'rolling_boulder' | 'spike_trap' | 'quicksand' | 'snake' | 'collapsing_bridge';
/** Pickup effects supported by the renderer. */
export type CollectibleType = 'coin' | 'relic' | 'powerup_shield' | 'powerup_magnet';
/** Reserved decoration identities; not currently rendered. */
export type DecorationType = 'tree' | 'fern' | 'ruin_pillar' | 'torch' | 'hanging_moss' | 'waterfall_bg';
/** Authored obstacle recipe, retaining the existing scene-specific dimensions. */
export interface ChunkObstacle {
  /** Hazard or traversal discriminator. */
  type: ObstacleType;
  /** Horizontal chunk offset in pixels. */
  xOffset: number;
  /** Optional authored vertical offset; the scene uses type-specific positions. */
  yOffset?: number;
  /** Gap extent; solid bodies retain scene-specific dimensions. */
  width?: number;
  /** Optional authored height. */
  height?: number;
  /** Moving hazard velocity in pixels/second. */
  speed?: number;
  /** Optional type-specific traversal metadata. */
  meta?: {
    /** Logical vine length in pixels. */
    length: number;
  };
}
/** Chunk-local pickup position and effect. */
export interface ChunkCollectible {
  /** Pickup texture/effect identity. */
  type: CollectibleType;
  /** Horizontal offset in pixels. */
  xOffset: number;
  /** Offset from ground Y in pixels. */
  yOffset: number;
}
/** Reserved scenery metadata. */
export interface ChunkDecoration {
  /** Decoration identity. */
  type: DecorationType;
  /** Horizontal chunk offset. */
  xOffset: number;
  /** Vertical offset from ground. */
  yOffset: number;
}
/** Authoritative Rust-owned catalog entry. */
export interface ChunkDefinition {
  /** Stable repeat-avoidance identity. */
  id: string;
  /** Human-readable recipe title. */
  name: string;
  /** Chunk span in virtual pixels. */
  width: number;
  /** First unlocked difficulty tier. */
  minTier: number;
  /** Authored environment identity. */
  biome: BiomeType;
  /** Terrain and hazard recipes. */
  obstacles: ChunkObstacle[];
  /** Pickup recipes. */
  collectibles: ChunkCollectible[];
  /** Optional reserved scenery. */
  decorations?: ChunkDecoration[];
}
/** Native-computed terrain tile, including voids that produce no sprite. */
export interface TerrainTile {
  /** Tile-center offset in virtual pixels; tiles are 64 pixels wide. */
  xOffset: number;
  /** Surface identity, chosen by first inclusive matching gap interval. */
  type: 'ground' | 'water_lagoon' | 'quicksand' | 'pit';
}
/** Complete scene-ready recipe and precomputed terrain coverage. */
export interface PlannedChunk extends ChunkDefinition {
  /** Ordered 64-pixel tile-center plan. */
  tiles: TerrainTile[];
}
/** Stateless continuation token; no native run sessions need cleanup. */
export interface WorldState {
  /** Current unsigned Mulberry32 accumulator. */
  rngState: number;
  /** Last recipe identity, or empty string before the first selection. */
  lastChunkId: string;
}
/** Bounded ordered batch; each distance is the actual selection-time game-meter value. */
export interface WorldRequest {
  /** Last successfully committed continuation. */
  state: WorldState;
  /** One through 64 finite nonnegative distances. */
  distances: number[];
}
/** Atomically consumed world batch. */
export interface WorldBatch {
  /** Continuation after every returned chunk. */
  state: WorldState;
  /** Exactly one planned chunk for each requested distance, in request order. */
  chunks: PlannedChunk[];
}
/** Paused terrain-loading/error UI contract. */
export interface WorldStatus {
  /** Loading versus failure presentation, including nonretryable renderer failures. */
  kind: 'loading' | 'error';
  /** Visible loading or failure explanation. */
  message: string;
  /** Retry the same uncommitted request; null while a request is pending. */
  retry: (() => void) | null;
}
