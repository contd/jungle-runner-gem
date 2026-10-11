/**
 * Offline cloud-boundary contract checks.
 * @remarks
 * - Payload preparation retains schema/progression and includes Harry's unlocked ID.
 * - Max-progress reconciliation prefers higher remote bests/coins and unions known unlocks.
 * These tests do not contact a backend or prove authoritative-policy behavior.
 * Fixtures use wall-clock timestamps without asserting exact values.
 * @module tests/cloudSync
 */
import { describe, it, expect } from 'vitest';
import { CloudSyncService } from '../src/data/cloudSyncArchitecture.ts';
import { createDefaultProfile } from '../src/data/storage.ts';

/** Exercise prospective payload/reconciliation behavior without remote dependencies. */
describe('Cloud Synchronization Architecture & Conflict Reconciliation', () => {
  /** Offline service shared by these stateless preparation/reconciliation checks. */
  const syncService = new CloudSyncService();

  /** Verify the projected payload preserves representative profile values and known unlocks. */
  it('correctly prepares a sanitized payload from a local profile', () => {
    /** Fresh aggregate with distinctive progression values for projection assertions. */
    const localProfile = createDefaultProfile();
    localProfile.stats.highScore = 8500;
    localProfile.stats.totalDistanceMeters = 3400;

    /** Projection under test; no network call is performed. */
    const payload = syncService.preparePayload(localProfile);
    expect(payload.version).toBe(1);
    expect(payload.stats.highScore).toBe(8500);
    expect(payload.stats.totalDistanceMeters).toBe(3400);
    expect(payload.unlockedSkinIds).toContain('harry');
  });

  /** Verify higher remote maxima/coin totals and known remote unlocks survive reconciliation. */
  it('correctly merges remote data keeping highest score and union of unlocks', () => {
    /** Lower local bests make the expected max-progress selection unambiguous. */
    const local = createDefaultProfile();
    local.stats.highScore = 4000;
    local.stats.longestDistanceMeters = 500;
    local.stats.totalCoins = 40;

    /** Remote fixture exceeds local bests and adds Maya plus two achievement IDs. */
    const remotePayload = {
      version: 1,
      userId: 'user_123',
      clientTimestamp: Date.now() - 5000,
      stats: {
        totalRuns: 5,
        totalDistanceMeters: 4000,
        totalCoins: 80,
        totalRelics: 4,
        highScore: 7500, // higher than local
        longestDistanceMeters: 900, // longer than local
        mostVinesSwungInSingleRun: 6,
        totalHazardsAvoided: 15,
        lastPlayedTimestamp: Date.now()
      },
      runs: [],
      unlockedSkinIds: ['harry', 'maya'],
      unlockedAchievementIds: ['first_steps', 'deep_trek'],
      deviceFingerprint: 'device_b'
    };

    /** Independent reconciled aggregate returned by the max-progress policy. */
    const merged = syncService.reconcileProfiles(local, remotePayload, 'MERGE_MAX_PROGRESS');

    expect(merged.stats.highScore).toBe(7500);
    expect(merged.stats.longestDistanceMeters).toBe(900);
    expect(merged.stats.totalCoins).toBe(80);
    expect(merged.unlockedSkins.find(s => s.id === 'maya')?.unlocked).toBe(true);
    expect(merged.achievements.find(a => a.id === 'deep_trek')?.unlocked).toBe(true);
  });
});
