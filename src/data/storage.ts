/**
 * Browser-only IndexedDB/LocalStorage persistence and legacy migration reads.
 * Native builds load this module only for one-time migration and never write
 * browser profiles. Default helpers are reexported for existing browser callers.
 * @module data/storage
 */
import type { LocalProfile, Achievement, CharacterSkin } from './types.ts';
import { createDefaultProfile, INITIAL_ACHIEVEMENTS, INITIAL_SKINS } from './defaults.ts';
export {
  createDefaultProfile, DEFAULT_KEY_BINDINGS, INITIAL_SETTINGS,
  INITIAL_STATS, INITIAL_ACHIEVEMENTS, INITIAL_SKINS
} from './defaults.ts';

/** Origin-scoped legacy database, retained for standalone browser compatibility. */
const DB_NAME = 'jungle_run_db';
/** IndexedDB structural version, unchanged by the native migration. */
const DB_VERSION = 1;
/** Store containing the single browser aggregate. */
const STORE_NAME = 'profile_store';
/** Fixed saved profile key. */
const PROFILE_KEY = 'player_profile_v1';
/** Browser JSON mirror read as a migration fallback. */
const LOCAL_STORAGE_FALLBACK_KEY = 'jungle_run_profile_fallback';

/** Lazy browser persistence adapter; strict migration reads never manufacture defaults. */
class StorageManager {
  /** Shared IndexedDB opening attempt; failed attempts are cleared for explicit retry. */
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  /** Open/create the existing profile store; native migration handles errors explicitly. */
  private openDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
    this.dbPromise ??= new Promise<IDBDatabase | null>((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      /** A blocked request can still succeed later; close that abandoned connection. */
      let abandoned = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        if (abandoned) request.result.close();
        else resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB failed to open'));
      request.onblocked = () => {
        abandoned = true;
        reject(new Error('IndexedDB profile database is blocked'));
      };
    }).catch((error: unknown) => {
      this.dbPromise = null;
      throw error;
    });
    return this.dbPromise;
  }

  /**
   * Read an existing aggregate without creating/saving defaults.
   * @param strict - Native migration rejects unresolved read failures, never silently
   * migrates an empty profile over unreadable legacy data. A valid mirror can recover
   * an IndexedDB failure; successful recovery is logged.
   */
  public async loadExistingProfile(strict = false): Promise<LocalProfile | null> {
    const failures: unknown[] = [];
    try {
      const db = await this.openDB();
      if (db) {
        const record = await new Promise<unknown>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(PROFILE_KEY);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error ?? new Error('IndexedDB profile read failed'));
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB profile read aborted'));
        });
        if (record) return strict ? this.legacyObject(record) : this.migrateAndValidateProfile(record);
      }
    } catch (error) {
      console.warn('Error reading legacy IndexedDB profile:', error);
      failures.push(error);
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          return strict ? this.legacyObject(parsed) : this.migrateAndValidateProfile(parsed);
        }
      }
    } catch (error) {
      console.warn('Error reading legacy LocalStorage profile:', error);
      failures.push(error);
    }
    if (strict && failures.length) {
      throw new Error('Cannot read existing browser profile for native migration. Restore a valid browser backup before retrying.', {
        cause: failures[0]
      });
    }
    return null;
  }

  /**
   * Preserve raw legacy fields for Rust validation/migration, including older partial schemas.
   * The cast is confined to this historical storage boundary; it is not trusted by native code.
   */
  private legacyObject(value: unknown): LocalProfile {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Legacy profile must be an object');
    }
    return value as LocalProfile;
  }

  /** Browser load behavior: try saved sources, otherwise create and attempt to persist defaults. */
  public async loadProfile(): Promise<LocalProfile> {
    const existing = await this.loadExistingProfile();
    if (existing) return existing;
    const defaults = createDefaultProfile();
    await this.saveProfile(defaults);
    return defaults;
  }

  /** Write IndexedDB and a JSON backup; this is never used for native profile mutations. */
  public async saveProfile(profile: LocalProfile): Promise<boolean> {
    profile.lastUpdated = Date.now();
    let idbSuccess = false;
    try {
      const db = await this.openDB();
      if (db) {
        idbSuccess = await new Promise<boolean>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(profile, PROFILE_KEY);
          tx.oncomplete = () => resolve(true);
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB save aborted'));
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB save failed'));
        });
      }
    } catch (error) {
      console.warn('Error saving browser IndexedDB profile:', error);
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(profile));
        return true;
      }
    } catch (error) {
      console.warn('Error saving browser LocalStorage profile:', error);
    }
    return idbSuccess;
  }

  /** Preserve the browser's historical permissive field filling and catalog merging. */
  private migrateAndValidateProfile(data: any): LocalProfile {
    const fallback = createDefaultProfile();
    if (!data || typeof data !== 'object') return fallback;
    return {
      schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : 1,
      lastUpdated: data.lastUpdated || Date.now(),
      selectedCharacterId: data.selectedCharacterId || 'harry',
      stats: {
        totalRuns: data.stats?.totalRuns ?? fallback.stats.totalRuns,
        totalDistanceMeters: data.stats?.totalDistanceMeters ?? fallback.stats.totalDistanceMeters,
        totalCoins: data.stats?.totalCoins ?? fallback.stats.totalCoins,
        totalRelics: data.stats?.totalRelics ?? fallback.stats.totalRelics,
        highScore: data.stats?.highScore ?? fallback.stats.highScore,
        longestDistanceMeters: data.stats?.longestDistanceMeters ?? fallback.stats.longestDistanceMeters,
        mostVinesSwungInSingleRun: data.stats?.mostVinesSwungInSingleRun ?? fallback.stats.mostVinesSwungInSingleRun,
        totalHazardsAvoided: data.stats?.totalHazardsAvoided ?? fallback.stats.totalHazardsAvoided,
        lastPlayedTimestamp: data.stats?.lastPlayedTimestamp ?? Date.now()
      },
      settings: {
        musicVolume: typeof data.settings?.musicVolume === 'number' ? data.settings.musicVolume : fallback.settings.musicVolume,
        sfxVolume: typeof data.settings?.sfxVolume === 'number' ? data.settings.sfxVolume : fallback.settings.sfxVolume,
        isMuted: Boolean(data.settings?.isMuted),
        screenShake: data.settings?.screenShake ?? true,
        particleDensity: data.settings?.particleDensity || 'high',
        showTouchControls: data.settings?.showTouchControls || 'auto',
        keyBindings: data.settings?.keyBindings || fallback.settings.keyBindings
      },
      achievements: this.mergeAchievements(data.achievements),
      unlockedSkins: this.mergeSkins(data.unlockedSkins),
      recentRuns: Array.isArray(data.recentRuns) ? data.recentRuns.slice(0, 50) : []
    };
  }

  /** Reapply catalog metadata while restoring saved goal progress by ID. */
  private mergeAchievements(savedAchievements: any[]): Achievement[] {
    const list = structuredClone(INITIAL_ACHIEVEMENTS);
    if (!Array.isArray(savedAchievements)) return list;
    const map = new Map<string, any>(savedAchievements.map(a => [a.id, a]));
    return list.map(initial => {
      const saved = map.get(initial.id);
      return saved ? {
        ...initial,
        progress: typeof saved.progress === 'number' ? saved.progress : initial.progress,
        unlocked: Boolean(saved.unlocked),
        unlockedAt: saved.unlockedAt
      } : initial;
    });
  }

  /** Restore known explorer unlocks; Harry remains available even in older saves. */
  private mergeSkins(savedSkins: any[]): CharacterSkin[] {
    const list = structuredClone(INITIAL_SKINS);
    if (!Array.isArray(savedSkins)) return list;
    const map = new Map<string, any>(savedSkins.map(s => [s.id, s]));
    return list.map(initial => {
      const saved = map.get(initial.id);
      return saved ? { ...initial, unlocked: initial.id === 'harry' || Boolean(saved.unlocked) } : initial;
    });
  }
}

/** Shared browser adapter, also used for the native backend's one-time legacy read. */
export const storageManager = new StorageManager();
export type { StorageManager };
