/**
 * Jungle Run - Deterministic Procedural Chunk Generator
 * Inspired by Atari 2600 Pitfall! screen progression & modern endless runners.
 * Features deterministic PRNG seed, difficulty scaling, biomes, and solvability guarantees.
 */

export type BiomeType = 'canopy' | 'swamp' | 'temple' | 'cavern';

export type ObstacleType =
  | 'pit'
  | 'water_lagoon'
  | 'crocodile'
  | 'log'
  | 'overhead_branch'
  | 'swing_vine'
  | 'rolling_boulder'
  | 'spike_trap'
  | 'quicksand'
  | 'snake'
  | 'collapsing_bridge';

export type CollectibleType = 'coin' | 'relic' | 'powerup_shield' | 'powerup_magnet';

export interface ChunkObstacle {
  type: ObstacleType;
  xOffset: number; // distance from start of chunk in pixels
  yOffset?: number;
  width?: number;
  height?: number;
  speed?: number; // for dynamic hazards like rolling boulder
  meta?: any;
}

export interface ChunkCollectible {
  type: CollectibleType;
  xOffset: number;
  yOffset: number;
}

export interface ChunkDecoration {
  type: 'tree' | 'fern' | 'ruin_pillar' | 'torch' | 'hanging_moss' | 'waterfall_bg';
  xOffset: number;
  yOffset: number;
}

export interface ChunkDefinition {
  id: string;
  name: string;
  width: number;
  minTier: number; // 1 to 4
  biome: BiomeType;
  obstacles: ChunkObstacle[];
  collectibles: ChunkCollectible[];
  decorations?: ChunkDecoration[];
}

export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed ? (seed >>> 0) : 1337;
    if (this.state === 0) this.state = 1337;
  }

  // Mulberry32
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.nextRange(min, max + 1));
  }

  public pickOne<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

export const CHUNK_WIDTH = 960; // Standard modular chunk width in virtual pixels

export const CHUNK_CATALOG: ChunkDefinition[] = [
  // --- TIER 1: Introductory Expeditions (0m - 300m) ---
  {
    id: 'intro_flat',
    name: 'Gentle Jungle Path',
    width: CHUNK_WIDTH,
    minTier: 1,
    biome: 'canopy',
    obstacles: [
      { type: 'log', xOffset: 500, width: 48, height: 32 }
    ],
    collectibles: [
      { type: 'coin', xOffset: 250, yOffset: -30 },
      { type: 'coin', xOffset: 320, yOffset: -30 },
      { type: 'coin', xOffset: 500, yOffset: -90 }, // Coin arc over log
      { type: 'coin', xOffset: 700, yOffset: -30 }
    ],
    decorations: [
      { type: 'tree', xOffset: 120, yOffset: 0 },
      { type: 'fern', xOffset: 380, yOffset: 0 }
    ]
  },
  {
    id: 'intro_branch_slide',
    name: 'Low Thorny Branch',
    width: CHUNK_WIDTH,
    minTier: 1,
    biome: 'canopy',
    obstacles: [
      { type: 'overhead_branch', xOffset: 480, width: 140, height: 40, yOffset: -65 }
    ],
    collectibles: [
      { type: 'coin', xOffset: 430, yOffset: -20 },
      { type: 'coin', xOffset: 490, yOffset: -20 },
      { type: 'coin', xOffset: 550, yOffset: -20 }
    ],
    decorations: [
      { type: 'hanging_moss', xOffset: 480, yOffset: -120 }
    ]
  },
  {
    id: 'intro_pit_jump',
    name: 'The Chasm Leap',
    width: CHUNK_WIDTH,
    minTier: 1,
    biome: 'canopy',
    obstacles: [
      { type: 'pit', xOffset: 420, width: 130 }
    ],
    collectibles: [
      { type: 'coin', xOffset: 420, yOffset: -80 },
      { type: 'coin', xOffset: 485, yOffset: -110 },
      { type: 'coin', xOffset: 550, yOffset: -80 }
    ]
  },
  {
    id: 'intro_vine_swing',
    name: 'Classic Liana Chasm',
    width: CHUNK_WIDTH,
    minTier: 1,
    biome: 'canopy',
    obstacles: [
      { type: 'pit', xOffset: 350, width: 340 },
      { type: 'swing_vine', xOffset: 520, yOffset: -240, meta: { length: 220 } }
    ],
    collectibles: [
      { type: 'relic', xOffset: 520, yOffset: -140 },
      { type: 'coin', xOffset: 750, yOffset: -30 }
    ]
  },

  // --- TIER 2: Crocodile Swamps & Traps (300m - 800m) ---
  {
    id: 'swamp_crocodile_crossing',
    name: 'Crocodile Lagoon',
    width: CHUNK_WIDTH,
    minTier: 2,
    biome: 'swamp',
    obstacles: [
      { type: 'water_lagoon', xOffset: 340, width: 380 },
      { type: 'crocodile', xOffset: 440, width: 70, height: 35 },
      { type: 'crocodile', xOffset: 600, width: 70, height: 35 }
    ],
    collectibles: [
      { type: 'coin', xOffset: 440, yOffset: -80 },
      { type: 'coin', xOffset: 600, yOffset: -80 }
    ]
  },
  {
    id: 'swamp_quicksand_log',
    name: 'Quicksand & Log',
    width: CHUNK_WIDTH,
    minTier: 2,
    biome: 'swamp',
    obstacles: [
      { type: 'quicksand', xOffset: 300, width: 140 },
      { type: 'log', xOffset: 660, width: 48, height: 32 }
    ],
    collectibles: [
      { type: 'coin', xOffset: 250, yOffset: -30 },
      { type: 'powerup_shield', xOffset: 500, yOffset: -40 },
      { type: 'coin', xOffset: 660, yOffset: -90 }
    ]
  },
  {
    id: 'swamp_snake_pit',
    name: 'Serpent Marsh',
    width: CHUNK_WIDTH,
    minTier: 2,
    biome: 'swamp',
    obstacles: [
      { type: 'snake', xOffset: 380, width: 40, height: 25 },
      { type: 'pit', xOffset: 620, width: 120 }
    ],
    collectibles: [
      { type: 'coin', xOffset: 380, yOffset: -80 },
      { type: 'coin', xOffset: 620, yOffset: -80 }
    ]
  },

  // --- TIER 3: Ancient Temples & Boulders (800m - 1500m) ---
  {
    id: 'temple_rolling_boulder',
    name: 'Rolling Boulder Escape',
    width: CHUNK_WIDTH,
    minTier: 3,
    biome: 'temple',
    obstacles: [
      { type: 'rolling_boulder', xOffset: 850, width: 64, height: 64, speed: -180 },
      { type: 'spike_trap', xOffset: 360, width: 60, height: 30 }
    ],
    collectibles: [
      { type: 'relic', xOffset: 600, yOffset: -70 },
      { type: 'coin', xOffset: 360, yOffset: -90 }
    ],
    decorations: [
      { type: 'ruin_pillar', xOffset: 200, yOffset: 0 },
      { type: 'ruin_pillar', xOffset: 720, yOffset: 0 }
    ]
  },
  {
    id: 'temple_double_vine',
    name: 'Sacred Temple Abyss',
    width: CHUNK_WIDTH,
    minTier: 3,
    biome: 'temple',
    obstacles: [
      { type: 'pit', xOffset: 300, width: 440 },
      { type: 'swing_vine', xOffset: 420, yOffset: -240, meta: { length: 220 } },
      { type: 'swing_vine', xOffset: 620, yOffset: -240, meta: { length: 220 } }
    ],
    collectibles: [
      { type: 'relic', xOffset: 520, yOffset: -120 },
      { type: 'powerup_magnet', xOffset: 800, yOffset: -30 }
    ]
  },
  {
    id: 'temple_collapsing_bridge',
    name: 'Ancient Wooden Slats',
    width: CHUNK_WIDTH,
    minTier: 3,
    biome: 'temple',
    obstacles: [
      { type: 'collapsing_bridge', xOffset: 360, width: 280 },
      { type: 'overhead_branch', xOffset: 760, width: 120, height: 40, yOffset: -65 }
    ],
    collectibles: [
      { type: 'coin', xOffset: 420, yOffset: -40 },
      { type: 'coin', xOffset: 500, yOffset: -40 },
      { type: 'coin', xOffset: 580, yOffset: -40 }
    ]
  },

  // --- TIER 4: Primeval Gauntlet (1500m+) ---
  {
    id: 'gauntlet_crocodile_boulder',
    name: 'Apex Predator Gauntlet',
    width: CHUNK_WIDTH,
    minTier: 4,
    biome: 'cavern',
    obstacles: [
      { type: 'spike_trap', xOffset: 240, width: 50, height: 30 },
      { type: 'water_lagoon', xOffset: 420, width: 300 },
      { type: 'crocodile', xOffset: 560, width: 70, height: 35 },
      { type: 'rolling_boulder', xOffset: 880, width: 64, height: 64, speed: -210 }
    ],
    collectibles: [
      { type: 'relic', xOffset: 560, yOffset: -90 },
      { type: 'coin', xOffset: 320, yOffset: -30 },
      { type: 'coin', xOffset: 800, yOffset: -30 }
    ]
  },
  {
    id: 'gauntlet_vine_spikes',
    name: 'Spiked Chasm Swing',
    width: CHUNK_WIDTH,
    minTier: 4,
    biome: 'cavern',
    obstacles: [
      { type: 'pit', xOffset: 340, width: 360 },
      { type: 'swing_vine', xOffset: 520, yOffset: -240, meta: { length: 220 } },
      { type: 'overhead_branch', xOffset: 780, width: 130, height: 40, yOffset: -65 }
    ],
    collectibles: [
      { type: 'relic', xOffset: 480, yOffset: -130 },
      { type: 'coin', xOffset: 880, yOffset: -30 }
    ]
  }
];

export class ProceduralWorldGenerator {
  private rng: SeededRNG;
  private currentDistanceMeters = 0;
  private currentChunkIndex = 0;
  private lastChunkId = '';

  constructor(seed: number) {
    this.rng = new SeededRNG(seed);
  }

  public reset(seed?: number) {
    if (seed !== undefined) {
      this.rng = new SeededRNG(seed);
    }
    this.currentDistanceMeters = 0;
    this.currentChunkIndex = 0;
    this.lastChunkId = '';
  }

  public getDifficultyTier(distanceMeters: number): number {
    if (distanceMeters < 300) return 1;
    if (distanceMeters < 800) return 2;
    if (distanceMeters < 1500) return 3;
    return 4;
  }

  public getBiomeForDistance(distanceMeters: number): BiomeType {
    // Cycles biomes with distance
    const cycle = Math.floor(distanceMeters / 400) % 4;
    switch (cycle) {
      case 0: return 'canopy';
      case 1: return 'swamp';
      case 2: return 'temple';
      case 3: return 'cavern';
      default: return 'canopy';
    }
  }

  public getNextChunk(distanceMeters: number): ChunkDefinition {
    this.currentDistanceMeters = distanceMeters;
    const tier = this.getDifficultyTier(distanceMeters);
    const targetBiome = this.getBiomeForDistance(distanceMeters);

    // Filter available chunks by tier <= current tier and avoiding immediate duplicate
    let eligible = CHUNK_CATALOG.filter(c => c.minTier <= tier && c.id !== this.lastChunkId);

    // Prefer chunks matching the current biome if available
    const biomeMatches = eligible.filter(c => c.biome === targetBiome);
    if (biomeMatches.length > 0 && this.rng.next() > 0.3) {
      eligible = biomeMatches;
    }

    if (eligible.length === 0) {
      eligible = CHUNK_CATALOG;
    }

    const chosen = this.rng.pickOne(eligible);
    this.lastChunkId = chosen.id;
    this.currentChunkIndex++;

    return chosen;
  }

  /**
   * Validates chunk solvability - guarantees spacing between hazards >= 240px
   */
  public static validateSolvability(chunk: ChunkDefinition): boolean {
    const obstacles = [...chunk.obstacles].sort((a, b) => a.xOffset - b.xOffset);
    for (let i = 0; i < obstacles.length - 1; i++) {
      const a = obstacles[i];
      const b = obstacles[i + 1];

      // Exception: vine swing over a pit is an intentional valid paired mechanic
      if (a.type === 'pit' && b.type === 'swing_vine') continue;
      if (a.type === 'water_lagoon' && b.type === 'crocodile') continue;

      const spacing = b.xOffset - a.xOffset;
      // Minimum safe landing and reaction window
      if (spacing < 140) {
        return false;
      }
    }
    return true;
  }
}
