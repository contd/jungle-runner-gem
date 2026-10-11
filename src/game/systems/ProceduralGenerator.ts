/**
 * Lazy standalone-browser world planner, matching the native Rust implementation.
 * Both planners consume the authoritative Rust-owned JSON catalog. Native gameplay
 * never imports this module; rendering contracts are in worldTypes.
 * @module game/systems/ProceduralGenerator
 */
import catalog from '../../../src-tauri/src/game/chunk-catalog.json';
import { MAX_JUMP_GAP, WORLD_PACING } from './movement.ts';
import type {
  BiomeType, ObstacleType, CollectibleType, DecorationType, ChunkDefinition,
  WorldRequest, WorldBatch, TerrainTile
} from './worldTypes.ts';
export type {
  BiomeType, ObstacleType, CollectibleType, ChunkObstacle, ChunkCollectible,
  ChunkDecoration, ChunkDefinition
} from './worldTypes.ts';

/** Check bundled JSON discriminators rather than casting string fields to unions. */
function catalogEnum<T extends string>(value: string, values: readonly T[]): T {
  const found = values.find(candidate => candidate === value);
  if (!found) throw new Error(`Invalid world catalog discriminator: ${value}`);
  return found;
}

/** Logical viewport and standard authored chunk width in pixels. */
export const CHUNK_WIDTH = 960;
/** Browser-only typed view of the unchanged native-owned authored segments. */
export const CHUNK_CATALOG: ChunkDefinition[] = catalog.map(chunk => normalizeWorldChunk({
  ...chunk,
  biome: catalogEnum<BiomeType>(chunk.biome, ['canopy', 'swamp', 'temple', 'cavern']),
  obstacles: chunk.obstacles.map(obstacle => ({
    ...obstacle,
    type: catalogEnum<ObstacleType>(obstacle.type, [
      'pit', 'water_lagoon', 'crocodile', 'log', 'overhead_branch', 'swing_vine',
      'rolling_boulder', 'spike_trap', 'quicksand', 'snake', 'collapsing_bridge'
    ])
  })),
  collectibles: chunk.collectibles.map(collectible => ({
    ...collectible,
    type: catalogEnum<CollectibleType>(collectible.type, ['coin', 'relic', 'powerup_shield', 'powerup_magnet'])
  })),
  decorations: chunk.decorations?.map(decoration => ({
    ...decoration,
    type: catalogEnum<DecorationType>(decoration.type, ['tree', 'fern', 'ruin_pillar', 'torch', 'hanging_moss', 'waterfall_bg'])
  }))
}));

/** Mulberry32 with explicit wrapping matching Rust unsigned arithmetic. */
export class SeededRNG {
  /** Unsigned evolving accumulator, exposed for stateless request continuation. */
  public state: number;
  /** Normalize seed modulo 2^32, replacing an initial zero with 1337. */
  constructor(seed: number) {
    this.state = (seed >>> 0) || 1337;
  }
  /** Advance the stream and return a sample in [0, 1). */
  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Sample ordered finite bounds, excluding max. */
  public nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  /** Sample an inclusive integer interval. */
  public nextInt(min: number, max: number): number {
    return Math.floor(this.nextRange(min, max + 1));
  }
  /** Choose from a nonempty caller-supplied array. */
  public pickOne<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/** Browser selector retaining the historical public synchronous test/helper API. */
export class ProceduralWorldGenerator {
  /** Selection random stream. */
  private rng: SeededRNG;
  /** Last chosen catalog ID, excluded from the next selection. */
  public lastChunkId = '';
  /** Construct a stream from the normalized run seed. */
  constructor(seed: number) {
    this.rng = new SeededRNG(seed);
  }
  /** Current accumulator used to continue across native-compatible batches. */
  public get rngState(): number { return this.rng.state; }
  /** Restore an exact continuation, including a legitimate intermediate zero accumulator. */
  public restore(state: WorldRequest['state']): void {
    this.rng.state = state.rngState;
    this.lastChunkId = state.lastChunkId;
  }
  /** Clear the repeat guard; an omitted seed keeps the current stream position. */
  public reset(seed?: number): void {
    if (seed !== undefined) this.rng = new SeededRNG(seed);
    this.lastChunkId = '';
  }
  /** Inclusive next-tier starts follow the shared extended introduction. */
  public getDifficultyTier(distance: number): number {
    return distance < WORLD_PACING.tier2Meters ? 1
      : distance < WORLD_PACING.tier3Meters ? 2 : distance < WORLD_PACING.tier4Meters ? 3 : 4;
  }
  /** Cycle biome preference every 400 game meters. */
  public getBiomeForDistance(distance: number): BiomeType {
    const biomes: BiomeType[] = ['canopy', 'swamp', 'temple', 'cavern'];
    return biomes[Math.floor(distance / 400) % 4] ?? 'canopy';
  }
  /** Select in stable catalog order; matching biomes win when their sample exceeds 0.3. */
  public getNextChunk(distance: number): ChunkDefinition {
    const tier = this.getDifficultyTier(distance);
    const biome = this.getBiomeForDistance(distance);
    const available = CHUNK_CATALOG.filter(chunk => chunk.minTier <= tier
      && (distance >= WORLD_PACING.warmupMeters
        || chunk.id === 'warmup_stroll'
        || (distance >= WORLD_PACING.safeStartMeters && chunk.id === 'intro_flat')));
    let eligible = available.filter(chunk => chunk.id !== this.lastChunkId);
    if (!eligible.length) eligible = available;
    const matches = eligible.filter(chunk => chunk.biome === biome);
    if (matches.length && this.rng.next() > 0.3) eligible = matches;
    const chosen = this.rng.pickOne(eligible);
    this.lastChunkId = chosen.id;
    return chosen;
  }
  /** Static 140-pixel center-spacing heuristic, not a physics/playability guarantee. */
  public static validateSolvability(chunk: ChunkDefinition): boolean {
    if (!validateJumpGaps(chunk)) return false;
    const obstacles = [...chunk.obstacles].sort((a, b) => a.xOffset - b.xOffset);
    return obstacles.slice(1).every((b, index) => {
      const a = obstacles[index];
      return (a.type === 'pit' && b.type === 'swing_vine')
        || (a.type === 'water_lagoon' && b.type === 'crocodile')
        || b.xOffset - a.xOffset >= 140;
    });
  }
}

/** Check actual contiguous missing-ground tiles, not just authored obstacle centers. */
export function validateJumpGaps(chunk: ChunkDefinition): boolean {
  const tiles = planTerrain(chunk);
  for (let index = 0; index < tiles.length; index++) {
    if (tiles[index].type !== 'pit' && tiles[index].type !== 'water_lagoon') continue;
    const start = tiles[index].xOffset - 32;
    let end = start;
    while (index < tiles.length && (tiles[index].type === 'pit' || tiles[index].type === 'water_lagoon')) {
      end = tiles[index].xOffset + 32;
      index++;
    }
    if (end - start <= MAX_JUMP_GAP) continue;
    return false;
  }
  return true;
}

/** Narrow unsupported authored gaps until their rasterized terrain is single-jump safe. */
export function normalizeWorldChunk(chunk: ChunkDefinition): ChunkDefinition {
  const result = { ...chunk, obstacles: chunk.obstacles.map(obstacle => ({ ...obstacle })) };
  while (!validateJumpGaps(result)) {
    const gaps = result.obstacles.filter(obstacle =>
      (obstacle.type === 'pit' || obstacle.type === 'water_lagoon') && (obstacle.width || 140) > 0);
    const widest = gaps.sort((a, b) => (b.width ?? 140) - (a.width ?? 140))[0];
    if (!widest) throw new Error(`Cannot make world gaps jumpable: ${chunk.id}`);
    const width = (widest.width || 140) - 64;
    if (width <= 0) result.obstacles = result.obstacles.filter(obstacle => obstacle !== widest);
    else widest.width = width;
  }
  return result;
}

/** Plan terrain at inclusive tile-center gap boundaries, retaining first-match precedence. */
export function planTerrain(chunk: ChunkDefinition): TerrainTile[] {
  const gaps = chunk.obstacles.filter(obstacle =>
    obstacle.type === 'pit' || obstacle.type === 'water_lagoon' || obstacle.type === 'quicksand');
  const tiles: TerrainTile[] = [];
  for (let x = 0; x < chunk.width; x += 64) {
    const xOffset = x + 32;
    const gap = gaps.find(obstacle => Math.abs(xOffset - obstacle.xOffset) <= (obstacle.width || 140) / 2);
    const type = gap?.type;
    tiles.push({
      xOffset,
      type: type === 'pit' || type === 'water_lagoon' || type === 'quicksand' ? type : 'ground'
    });
  }
  return tiles;
}

/** Produce a batch using the same continuation and distance order as the native worker. */
export function planBrowserWorld(request: WorldRequest): WorldBatch {
  const generator = new ProceduralWorldGenerator(1337);
  generator.restore(request.state);
  const chunks = request.distances.map(distance => {
    const chunk = generator.getNextChunk(distance);
    return { ...chunk, tiles: planTerrain(chunk) };
  });
  return { state: { rngState: generator.rngState, lastChunkId: generator.lastChunkId }, chunks };
}
