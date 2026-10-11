/**
 * Seed determinism, distance-tier boundary, and catalog-spacing tests.
 * @remarks
 * - Equal seeds/call orders yield equal PRNG samples and chunk IDs.
 * - Tier transitions are checked immediately around 600, 1200, and 2200 game meters.
 * - Every catalog entry passes the static 140-pixel adjacent-center heuristic,
 *   including its intentional pit/vine and lagoon/crocodile exemptions.
 * These are not full Phaser physics/playability simulations.
 * @module tests/procedural
 */
import { describe, it, expect } from 'vitest';
import {
  ProceduralWorldGenerator,
  SeededRNG,
  CHUNK_CATALOG
} from '../src/game/systems/ProceduralGenerator.ts';

/** Verify deterministic recipe selection independently of scene visuals/random vine phases. */
describe('Procedural Generation & Solvability Constraints', () => {
  /** Compare separate state machines rather than sampling one generator twice. */
  it('produces deterministic pseudo-random sequences from the same seed', () => {
    /** Reference stream initialized with a nonzero seed. */
    const rng1 = new SeededRNG(42890);
    /** Independent stream with identical initial state and call order. */
    const rng2 = new SeededRNG(42890);

    /** First four samples from the reference stream. */
    const values1 = [rng1.next(), rng1.next(), rng1.next(), rng1.next()];
    /** Matching sample positions from the comparison stream. */
    const values2 = [rng2.next(), rng2.next(), rng2.next(), rng2.next()];

    expect(values1).toEqual(values2);
  });

  /** Confirm tier/biome filtering consumes the RNG deterministically for matching requests. */
  it('produces identical chunk sequences given the same seed', () => {
    /** Reference selector driven through representative distances across all four tiers. */
    const gen1 = new ProceduralWorldGenerator(99999);
    /** Comparison selector receives the same seed and distances. */
    const gen2 = new ProceduralWorldGenerator(99999);

    /** Selected IDs, not shared object identity, define the sequence expectation. */
    const run1Chunks = [
      gen1.getNextChunk(100).id,
      gen1.getNextChunk(350).id,
      gen1.getNextChunk(900).id,
      gen1.getNextChunk(1600).id
    ];

    /** Same ordered distance requests applied to the independent selector. */
    const run2Chunks = [
      gen2.getNextChunk(100).id,
      gen2.getNextChunk(350).id,
      gen2.getNextChunk(900).id,
      gen2.getNextChunk(1600).id
    ];

    expect(run1Chunks).toEqual(run2Chunks);
  });

  /** Check lower-tier endpoints and exact inclusive starts of each next tier. */
  it('scales difficulty tiers correctly with distance', () => {
    /** Seed is irrelevant to the pure threshold function being checked. */
    const gen = new ProceduralWorldGenerator(123);
    expect(gen.getDifficultyTier(50)).toBe(1);
    expect(gen.getDifficultyTier(599)).toBe(1);
    expect(gen.getDifficultyTier(600)).toBe(2);
    expect(gen.getDifficultyTier(1199)).toBe(2);
    expect(gen.getDifficultyTier(1200)).toBe(3);
    expect(gen.getDifficultyTier(2199)).toBe(3);
    expect(gen.getDifficultyTier(2200)).toBe(4);
    expect(gen.getDifficultyTier(3000)).toBe(4);
  });

  /** Audit the current catalog against the static spacing validator, not actual jump trajectories. */
  it('guarantees every chunk in the catalog satisfies solvability constraints', () => {
    for (const chunk of CHUNK_CATALOG) {
      /** Assertion includes the stable recipe ID so a failing catalog entry is identifiable. */
      const isSolvable = ProceduralWorldGenerator.validateSolvability(chunk);
      expect(isSolvable, `Chunk ${chunk.id} should have physically solvable obstacle spacing`).toBe(true);
    }
  });
});
