/**
 * Jungle Run - Browser-only Game Repository
 * Manages player profile, completed runs, stats accumulation, achievement triggers,
 * and skin unlocks.
 * @module data/browserRepository
 */

import { LocalProfile, GameSettings, RunRecord } from './types.ts';
import { storageManager, createDefaultProfile } from './storage.ts';

/**
 * Mutable local profile cache and synchronous subscription boundary for React.
 * Mutation methods attempt persistence before notifying, but do not enforce the
 * storage adapter's boolean success result. Returned profiles are not defensive copies.
 */
export class BrowserGameRepository {
  /** Cached aggregate, populated on first load or replaced by import/reset. */
  private currentProfile: LocalProfile | null = null;
  /** Subscribers receive the same mutable aggregate held by this repository. */
  private listeners: Set<(profile: LocalProfile) => void> = new Set();

  /** Lazily load the aggregate and return the cached instance on subsequent calls. */
  public async getProfile(): Promise<LocalProfile> {
    if (!this.currentProfile) {
      this.currentProfile = await storageManager.loadProfile();
    }
    return this.currentProfile;
  }

  /**
   * Subscribe to profile mutations; immediately notify if the cache is populated.
   * @param callback - Synchronous observer of the shared profile instance.
   * @returns An unsubscribe function suitable for React effect cleanup.
   */
  public subscribe(callback: (profile: LocalProfile) => void): () => void {
    this.listeners.add(callback);
    if (this.currentProfile) {
      callback(this.currentProfile);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  /** Broadcast the loaded aggregate synchronously; observer exceptions propagate. */
  private notify() {
    if (!this.currentProfile) return;
    for (const listener of this.listeners) {
      listener(this.currentProfile);
    }
  }

  /**
   * Shallow-merge preferences, attempt saving, and notify observers.
   * @param settings - Changed fields; nested key bindings replace the whole mapping.
   * @returns The shared aggregate with updated preferences.
   */
  public async updateSettings(settings: Partial<GameSettings>): Promise<LocalProfile> {
    const profile = await this.getProfile();
    profile.settings = { ...profile.settings, ...settings };
    await storageManager.saveProfile(profile);
    this.notify();
    return profile;
  }

  /**
   * Persist a known unlocked explorer; unknown/locked IDs leave selection unchanged.
   * @param characterId - Stable catalog skin ID.
   * @returns The profile whether or not selection was accepted.
   */
  public async selectCharacter(characterId: string): Promise<LocalProfile> {
    const profile = await this.getProfile();
    const skin = profile.unlockedSkins.find(s => s.id === characterId);
    if (skin && skin.unlocked) {
      profile.selectedCharacterId = characterId;
      await storageManager.saveProfile(profile);
      this.notify();
    }
    return profile;
  }

  /**
   * Record an expedition, accumulate lifetime totals, and evaluate progression.
   * @param runData - Scene results plus selected mode/character; identity/time are added here.
   * @returns Updated profile, strict personal-best comparisons, and display names
   * of achievements/skins newly unlocked by this run.
   * @remarks History is capped at 30 newest runs. All supplied modes are counted.
   * Distance/score/vine-apprentice goals use run maxima; vine-master accumulates.
   * Crocodile/boulder goals currently count runs whose death code differs from
   * their expected code, rather than counting individual avoided hazards.
   */
  public async recordRun(runData: Omit<RunRecord, 'id' | 'timestamp'>): Promise<{
    /** Shared aggregate after progression and the persistence attempt. */
    profile: LocalProfile;
    /** Whether this score strictly exceeded the previously stored best. */
    newHighScore: boolean;
    /** Whether this distance strictly exceeded the previously stored best. */
    newLongestDistance: boolean;
    /** Achievement titles, not IDs, for result-screen notifications. */
    unlockedAchievements: string[];
    /** Explorer names, not IDs, for result-screen notifications. */
    unlockedSkins: string[];
  }> {
    const profile = await this.getProfile();
    const run: RunRecord = {
      ...runData,
      id: 'run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: Date.now()
    };

    // Update stats
    const stats = profile.stats;
    /** Snapshot before mutation so ties are not presented as new records. */
    const oldHighScore = stats.highScore;
    const oldLongestDistance = stats.longestDistanceMeters;

    const newHighScore = run.score > oldHighScore;
    const newLongestDistance = run.distanceMeters > oldLongestDistance;

    if (newHighScore) stats.highScore = run.score;
    if (newLongestDistance) stats.longestDistanceMeters = run.distanceMeters;

    stats.totalRuns += 1;
    stats.totalDistanceMeters += run.distanceMeters;
    stats.totalCoins += run.coinsCollected;
    stats.totalRelics += run.relicsCollected;
    stats.totalHazardsAvoided += run.hazardsAvoided;
    stats.mostVinesSwungInSingleRun = Math.max(stats.mostVinesSwungInSingleRun, run.vinesSwung);
    stats.lastPlayedTimestamp = Date.now();

    // Store recent run
    profile.recentRuns.unshift(run);
    if (profile.recentRuns.length > 30) {
      profile.recentRuns = profile.recentRuns.slice(0, 30);
    }

    // Process achievements
    /** Only transitions from locked to unlocked appear in this run's notifications. */
    const newlyUnlockedAchievements: string[] = [];
    for (const ach of profile.achievements) {
      if (ach.unlocked) continue;

      /** Goal-specific working progress, capped only after its counting rule runs. */
      let currentProg = ach.progress;
      switch (ach.id) {
        case 'first_steps':
          currentProg = Math.max(currentProg, run.distanceMeters);
          break;
        case 'deep_trek':
          currentProg = Math.max(currentProg, run.distanceMeters);
          break;
        case 'jungle_sovereign':
          currentProg = Math.max(currentProg, run.distanceMeters);
          break;
        case 'vine_apprentice':
          currentProg = Math.max(currentProg, run.vinesSwung);
          break;
        case 'vine_master':
          currentProg += run.vinesSwung;
          break;
        case 'coin_collector':
          currentProg = stats.totalCoins;
          break;
        case 'relic_hunter':
          currentProg = stats.totalRelics;
          break;
        case 'crocodile_dodger':
          currentProg += (run.causeOfDeath !== 'crocodile' ? 1 : 0);
          break;
        case 'boulder_survivor':
          currentProg += (run.causeOfDeath !== 'boulder' ? 1 : 0);
          break;
        case 'centurion':
          currentProg = stats.totalRuns;
          break;
        case 'high_scorer':
          currentProg = Math.max(currentProg, run.score);
          break;
      }

      ach.progress = Math.min(ach.maxProgress, currentProg);
      if (ach.progress >= ach.maxProgress) {
        ach.unlocked = true;
        ach.unlockedAt = Date.now();
        newlyUnlockedAchievements.push(ach.title);
      }
    }

    // Process skin unlocks
    const newlyUnlockedSkins: string[] = [];
    for (const skin of profile.unlockedSkins) {
      if (skin.unlocked) continue;
      if (skin.id === 'maya' && stats.totalCoins >= 50) {
        skin.unlocked = true;
        newlyUnlockedSkins.push(skin.name);
      } else if (skin.id === 'leo' && stats.totalDistanceMeters >= 1000) {
        skin.unlocked = true;
        newlyUnlockedSkins.push(skin.name);
      }
    }

    await storageManager.saveProfile(profile);
    this.notify();

    return {
      profile,
      newHighScore,
      newLongestDistance,
      unlockedAchievements: newlyUnlockedAchievements,
      unlockedSkins: newlyUnlockedSkins
    };
  }

  /** Serialize the entire cached profile as indented JSON for local backup/export. */
  public async exportData(): Promise<string> {
    const profile = await this.getProfile();
    return JSON.stringify(profile, null, 2);
  }

  /**
   * Replace the cache with a parsed object and attempt saving it.
   * @param jsonString - Backup JSON pasted by the player.
   * @returns False for non-object input or caught parse/save/notification exceptions.
   * @remarks This path does not apply storage's field migration or deep validation;
   * a true result does not guarantee schema correctness or durable persistence.
   */
  public async importData(jsonString: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') return false;
      this.currentProfile = parsed;
      await storageManager.saveProfile(this.currentProfile!);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  /** Replace all records/preferences/unlocks with defaults and notify after saving. */
  public async resetAllData(): Promise<LocalProfile> {
    this.currentProfile = createDefaultProfile();
    await storageManager.saveProfile(this.currentProfile);
    this.notify();
    return this.currentProfile;
  }
}

/** Application-wide repository connecting the React shell and local persistence. */
