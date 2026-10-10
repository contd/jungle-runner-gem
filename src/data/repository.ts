/**
 * Jungle Run - Local Game Repository
 * Manages player profile, completed runs, stats accumulation, achievement triggers,
 * and skin unlocks.
 */

import { LocalProfile, GameSettings, RunRecord, PlayerStats } from './types.ts';
import { storageManager, createDefaultProfile } from './storage.ts';

export class LocalGameRepository {
  private currentProfile: LocalProfile | null = null;
  private listeners: Set<(profile: LocalProfile) => void> = new Set();

  public async getProfile(): Promise<LocalProfile> {
    if (!this.currentProfile) {
      this.currentProfile = await storageManager.loadProfile();
    }
    return this.currentProfile;
  }

  public subscribe(callback: (profile: LocalProfile) => void): () => void {
    this.listeners.add(callback);
    if (this.currentProfile) {
      callback(this.currentProfile);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    if (!this.currentProfile) return;
    for (const listener of this.listeners) {
      listener(this.currentProfile);
    }
  }

  public async updateSettings(settings: Partial<GameSettings>): Promise<LocalProfile> {
    const profile = await this.getProfile();
    profile.settings = { ...profile.settings, ...settings };
    await storageManager.saveProfile(profile);
    this.notify();
    return profile;
  }

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

  public async recordRun(runData: Omit<RunRecord, 'id' | 'timestamp'>): Promise<{
    profile: LocalProfile;
    newHighScore: boolean;
    newLongestDistance: boolean;
    unlockedAchievements: string[];
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
    const newlyUnlockedAchievements: string[] = [];
    for (const ach of profile.achievements) {
      if (ach.unlocked) continue;

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

  public async exportData(): Promise<string> {
    const profile = await this.getProfile();
    return JSON.stringify(profile, null, 2);
  }

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

  public async resetAllData(): Promise<LocalProfile> {
    this.currentProfile = createDefaultProfile();
    await storageManager.saveProfile(this.currentProfile);
    this.notify();
    return this.currentProfile;
  }
}

export const gameRepository = new LocalGameRepository();
