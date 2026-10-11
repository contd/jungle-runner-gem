/**
 * Jungle Run - Future Cloud Synchronization Architecture & Contract
 *
 * This module defines the architectural boundaries, contracts, conflict
 * resolution policies, and payload schemas for future remote synchronization
 * without introducing mock network dependencies or requiring an active backend today.
 * This unused synchronous future-service contract stays frontend-only: moving a
 * no-network projection behind IPC would add latency without helping gameplay.
 * @module data/cloudSyncArchitecture
 */

import { LocalProfile, PlayerStats, RunRecord, SyncState } from './types.ts';

/** Prospective upload contract; contains progression/history, but excludes settings. */
export interface RemoteSyncPayload {
  /** Local profile schema revision, not an implemented server-side revision. */
  version: number;
  /** Placeholder account ID until authentication is implemented. */
  userId: string;
  /** Payload preparation time in epoch milliseconds. */
  clientTimestamp: number;
  /** Shallow copy of lifetime totals and maxima. */
  stats: PlayerStats;
  /** Copied history array; individual run objects remain shared with the profile. */
  runs: RunRecord[];
  /** Stable IDs of currently selectable explorers. */
  unlockedSkinIds: string[];
  /** Stable IDs of completed achievements. */
  unlockedAchievementIds: string[];
  /** Placeholder device marker, not a real fingerprint. */
  deviceFingerprint: string;
}

/**
 * Reserved policy names. Only `MERGE_MAX_PROGRESS` currently changes a profile;
 * authoritative policies return an unchanged deep copy of the local aggregate.
 */
export type ConflictResolutionPolicy =
  | 'MERGE_MAX_PROGRESS'
  | 'CLIENT_AUTHORITATIVE'
  | 'SERVER_AUTHORITATIVE';

/** Outcome envelope for future synchronization; current attempts report local-only failure. */
export interface SyncResult {
  /** Whether a remote synchronization actually succeeded. */
  success: boolean;
  /** Synchronization phase after the attempt. */
  state: SyncState;
  /** Optional successful-sync time in epoch milliseconds. */
  syncedTimestamp?: number;
  /** Optional number of conflicts reconciled by a future backend integration. */
  conflictsResolved?: number;
  /** User-facing explanation when synchronization cannot complete. */
  errorMessage?: string;
}

/** Backend boundary intentionally usable without a network service or player account. */
export interface ICloudSyncService {
  /**
   * Check whether a real backend is configured and available.
   */
  isAvailable(): boolean;

  /**
   * Project progression/history into the upload contract, excluding local preferences.
   * @param localProfile - Trusted local aggregate; this is not an untrusted-input sanitizer.
   */
  preparePayload(localProfile: LocalProfile): RemoteSyncPayload;

  /**
   * Reconcile profiles without mutating the local input.
   * @param local - Aggregate whose settings/catalogs are retained.
   * @param remote - Prospective remote progression payload.
   * @param policy - Conflict policy; only max-progress merging is implemented.
   */
  reconcileProfiles(
    local: LocalProfile,
    remote: RemoteSyncPayload,
    policy: ConflictResolutionPolicy
  ): LocalProfile;

  /**
   * Report the current offline-only boundary rather than simulate network success.
   */
  synchronize(localProfile: LocalProfile): Promise<SyncResult>;
}

/**
 * Offline implementation of the prospective backend boundary.
 * Max-progress reconciliation takes maxima for five statistics and unions unlock
 * flags; it does not merge runs, settings, all lifetime counters, or goal progress.
 */
export class CloudSyncService implements ICloudSyncService {
  /** Always false until a real cloud integration replaces this offline implementation. */
  public isAvailable(): boolean {
    // Current release is 100% offline local-first; returns false until cloud backend is configured.
    return false;
  }

  /** Build the prospective payload with placeholder identity and no network side effects. */
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

  /**
   * Deep-copy local data and optionally merge selected maxima plus known unlock IDs.
   * @returns An independent local-profile copy; unsupported policies leave it unchanged.
   */
  public reconcileProfiles(
    local: LocalProfile,
    remote: RemoteSyncPayload,
    policy: ConflictResolutionPolicy = 'MERGE_MAX_PROGRESS'
  ): LocalProfile {
    /** JSON cloning is appropriate here because profiles contain only JSON data. */
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

  /** Resolve an explicit unavailable result; no upload or profile mutation is performed. */
  public async synchronize(_localProfile: LocalProfile): Promise<SyncResult> {
    // Explicitly non-functional in current release as per Section 14
    return {
      success: false,
      state: 'local_only',
      errorMessage: 'Cloud synchronization is designed for future multi-device releases. Your game progress is securely stored locally.'
    };
  }
}

/** Shared offline boundary available to future multi-device integrations. */
export const cloudSyncService = new CloudSyncService();
