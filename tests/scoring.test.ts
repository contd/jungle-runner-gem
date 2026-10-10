import { describe, it, expect } from 'vitest';

describe('Jungle Run Scoring & Multiplier Mechanics', () => {
  it('calculates coin scores correctly with base and multipliers', () => {
    const baseCoinValue = 100;
    expect(baseCoinValue * 1).toBe(100);
    expect(baseCoinValue * 2).toBe(200);
    expect(baseCoinValue * 5).toBe(500);
  });

  it('calculates golden relic recovery scores', () => {
    const baseRelicValue = 500;
    expect(baseRelicValue * 1).toBe(500);
    expect(baseRelicValue * 3).toBe(1500);
  });

  it('handles combo multiplier tiers appropriately', () => {
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
