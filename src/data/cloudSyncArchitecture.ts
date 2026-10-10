/**
 * Jungle Run - Future Cloud Synchronization Architecture & Contract
 *
 * This module defines the architectural boundaries, contracts, conflict
 * resolution policies, and payload schemas for future remote synchronization
 * without introducing mock network dependencies or requiring an active backend today.
 */

import { LocalProfile, PlayerStats, RunRecord, SyncState } from './types.ts';

export interface RemoteSyncPayload {
  version: number;
  userId: string;
  clientTimestamp: number;
  stats: PlayerStats;
  runs: RunRecord[];
  unlockedSkinIds: string[];
  unlockedAchievementIds: string[];
  deviceFingerprint: string;
}

export type ConflictResolutionPolicy =
  | 'MERGE_MAX_PROGRESS'  // Default: retain highest score, sum valid runs, keep unlocked items
  | 'CLIENT_AUTHORITATIVE'
  | 'SERVER_AUTHORITATIVE';

export interface SyncResult {
  success: boolean;
  state: SyncState;
  syncedTimestamp?: number;
  conflictsResolved?: number;
  errorMessage?: string;
}

export interface ICloudSyncService {
  /**
   * Status check of cloud capability
   */
  isAvailable(): boolean;

  /**
   * Prepare a sanitized payload for remote sync
   */
  preparePayload(localProfile: LocalProfile): RemoteSyncPayload;

  /**
   * Reconcile remote and local profiles using defined conflict resolution policy
   */
  reconcileProfiles(
    local: LocalProfile,
    remote: RemoteSyncPayload,
    policy: ConflictResolutionPolicy
  ): LocalProfile;

  /**
   * Initiate sync routine (Stubbed for future real backend integration)
   */
  synchronize(localProfile: LocalProfile): Promise<SyncResult>;
}

export class CloudSyncService implements ICloudSyncService {
  public isAvailable(): boolean {
    // Current release is 100% offline local-first; returns false until cloud backend is configured.
    return false;
  }

  public preparePayload(localProfile: LocalProfile): RemoteSyncPayload {
    return {
      version: localProfile.schemaVersion,
      userId: 'local_anonymous_player',
      clientTimestamp: Date.now(),
      stats: { ...localProfile.stats },
      runs: [...localProfile.recentRuns],
      unlockedSkinIds: localProfile.unlockedSkins.filter(s => s.unlocked).map(s => s.id),
      unlockedAchievementIds: localProfile.achievements.filter(a => a.unlocked).map(a => a.id),
      deviceFingerprint: 'client_local'
    };
  }

  public reconcileProfiles(
    local: LocalProfile,
    remote: RemoteSyncPayload,
    policy: ConflictResolutionPolicy = 'MERGE_MAX_PROGRESS'
  ): LocalProfile {
    const merged = JSON.parse(JSON.stringify(local)) as LocalProfile;

    if (policy === 'MERGE_MAX_PROGRESS') {
      // High score and longest distance always take max
      merged.stats.highScore = Math.max(local.stats.highScore, remote.stats.highScore);
      merged.stats.longestDistanceMeters = Math.max(local.stats.longestDistanceMeters, remote.stats.longestDistanceMeters);
      merged.stats.totalRuns = Math.max(local.stats.totalRuns, remote.stats.totalRuns);
      merged.stats.totalCoins = Math.max(local.stats.totalCoins, remote.stats.totalCoins);
      merged.stats.totalRelics = Math.max(local.stats.totalRelics, remote.stats.totalRelics);

      // Union of unlocked skins
      const remoteSkinSet = new Set(remote.unlockedSkinIds);
      merged.unlockedSkins.forEach(skin => {
        if (remoteSkinSet.has(skin.id)) {
          skin.unlocked = true;
        }
      });

      // Union of unlocked achievements
      const remoteAchSet = new Set(remote.unlockedAchievementIds);
      merged.achievements.forEach(ach => {
        if (remoteAchSet.has(ach.id)) {
          ach.unlocked = true;
        }
      });
    }

    return merged;
  }

  public async synchronize(_localProfile: LocalProfile): Promise<SyncResult> {
    // Explicitly non-functional in current release as per Section 14
    return {
      success: false,
      state: 'local_only',
      errorMessage: 'Cloud synchronization is designed for future multi-device releases. Your game progress is securely stored locally.'
    };
  }
}

export const cloudSyncService = new CloudSyncService();
