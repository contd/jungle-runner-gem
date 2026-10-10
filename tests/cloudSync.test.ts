import { describe, it, expect } from 'vitest';
import { CloudSyncService } from '../src/data/cloudSyncArchitecture.ts';
import { createDefaultProfile } from '../src/data/storage.ts';

describe('Cloud Synchronization Architecture & Conflict Reconciliation', () => {
  const syncService = new CloudSyncService();

  it('correctly prepares a sanitized payload from a local profile', () => {
    const localProfile = createDefaultProfile();
    localProfile.stats.highScore = 8500;
    localProfile.stats.totalDistanceMeters = 3400;

    const payload = syncService.preparePayload(localProfile);
    expect(payload.version).toBe(1);
    expect(payload.stats.highScore).toBe(8500);
    expect(payload.stats.totalDistanceMeters).toBe(3400);
    expect(payload.unlockedSkinIds).toContain('harry');
  });

  it('correctly merges remote data keeping highest score and union of unlocks', () => {
    const local = createDefaultProfile();
    local.stats.highScore = 4000;
    local.stats.longestDistanceMeters = 500;
    local.stats.totalCoins = 40;

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

    const merged = syncService.reconcileProfiles(local, remotePayload, 'MERGE_MAX_PROGRESS');

    expect(merged.stats.highScore).toBe(7500);
    expect(merged.stats.longestDistanceMeters).toBe(900);
    expect(merged.stats.totalCoins).toBe(80);
    expect(merged.unlockedSkins.find(s => s.id === 'maya')?.unlocked).toBe(true);
    expect(merged.achievements.find(a => a.id === 'deep_trek')?.unlocked).toBe(true);
  });
});
