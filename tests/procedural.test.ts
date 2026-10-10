import { describe, it, expect } from 'vitest';
import {
  ProceduralWorldGenerator,
  SeededRNG,
  CHUNK_CATALOG
} from '../src/game/systems/ProceduralGenerator.ts';

describe('Procedural Generation & Solvability Constraints', () => {
  it('produces deterministic pseudo-random sequences from the same seed', () => {
    const rng1 = new SeededRNG(42890);
    const rng2 = new SeededRNG(42890);

    const values1 = [rng1.next(), rng1.next(), rng1.next(), rng1.next()];
    const values2 = [rng2.next(), rng2.next(), rng2.next(), rng2.next()];

    expect(values1).toEqual(values2);
  });

  it('produces identical chunk sequences given the same seed', () => {
    const gen1 = new ProceduralWorldGenerator(99999);
    const gen2 = new ProceduralWorldGenerator(99999);

    const run1Chunks = [
      gen1.getNextChunk(100).id,
      gen1.getNextChunk(350).id,
      gen1.getNextChunk(900).id,
      gen1.getNextChunk(1600).id
    ];

    const run2Chunks = [
      gen2.getNextChunk(100).id,
      gen2.getNextChunk(350).id,
      gen2.getNextChunk(900).id,
      gen2.getNextChunk(1600).id
    ];

    expect(run1Chunks).toEqual(run2Chunks);
  });

  it('scales difficulty tiers correctly with distance', () => {
    const gen = new ProceduralWorldGenerator(123);
    expect(gen.getDifficultyTier(50)).toBe(1);
    expect(gen.getDifficultyTier(299)).toBe(1);
    expect(gen.getDifficultyTier(300)).toBe(2);
    expect(gen.getDifficultyTier(799)).toBe(2);
    expect(gen.getDifficultyTier(800)).toBe(3);
    expect(gen.getDifficultyTier(1499)).toBe(3);
    expect(gen.getDifficultyTier(1500)).toBe(4);
    expect(gen.getDifficultyTier(3000)).toBe(4);
  });

  it('guarantees every chunk in the catalog satisfies solvability constraints', () => {
    for (const chunk of CHUNK_CATALOG) {
      const isSolvable = ProceduralWorldGenerator.validateSolvability(chunk);
      expect(isSolvable, `Chunk ${chunk.id} should have physically solvable obstacle spacing`).toBe(true);
    }
  });
});
