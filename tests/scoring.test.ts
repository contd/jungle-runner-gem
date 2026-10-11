/**
 * Arithmetic examples for pickup values and intended combo tiers.
 * @remarks
 * - Coins use a base 100-point value; relics use 500.
 * - The local multiplier fixture advances every four streak events, capped at five.
 * These examples do not invoke GameScene. Its current first-increase guard starts
 * at streak five, so these tests are not regression coverage for that runtime difference.
 * @module tests/scoring
 */
import { describe, it, expect } from 'vitest';

/** Document score arithmetic independently of a browser/Phaser instance. */
describe('Jungle Run Scoring & Multiplier Mechanics', () => {
  /** Verify the coin base value under representative score factors. */
  it('calculates coin scores correctly with base and multipliers', () => {
    /** Coin score before applying the run's current multiplier. */
    const baseCoinValue = 100;
    expect(baseCoinValue * 1).toBe(100);
    expect(baseCoinValue * 2).toBe(200);
    expect(baseCoinValue * 5).toBe(500);
  });

  /** Verify the relic base value with normal and triple scoring. */
  it('calculates golden relic recovery scores', () => {
    /** Relic score before multiplier application. */
    const baseRelicValue = 500;
    expect(baseRelicValue * 1).toBe(500);
    expect(baseRelicValue * 3).toBe(1500);
  });

  /** Check the fixture's four-event progression and five-times upper cap. */
  it('handles combo multiplier tiers appropriately', () => {
    /**
     * Model intended combo arithmetic locally; this is not the scene's implementation.
     * @param streak - Consecutive bonus-event count.
     * @returns One through five for the nonnegative streak values tested here.
     */
    const computeMultiplier = (streak: number) => {
      if (streak < 4) return 1;
      return Math.min(5, Math.floor(streak / 4) + 1);
    };

    expect(computeMultiplier(0)).toBe(1);
    expect(computeMultiplier(3)).toBe(1);
    expect(computeMultiplier(4)).toBe(2);
    expect(computeMultiplier(8)).toBe(3);
    expect(computeMultiplier(12)).toBe(4);
    expect(computeMultiplier(16)).toBe(5);
    expect(computeMultiplier(50)).toBe(5); // Cap at 5x
  });
});
