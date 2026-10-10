/**
 * Jungle Run - IndexedDB & LocalStorage Robust Persistence Layer
 * Fully functional offline, with schema migrations and recovery.
 */

import { LocalProfile, PlayerStats, GameSettings, Achievement, CharacterSkin, RunRecord } from './types.ts';

const DB_NAME = 'jungle_run_db';
const DB_VERSION = 1;
const STORE_NAME = 'profile_store';
const PROFILE_KEY = 'player_profile_v1';
const LOCAL_STORAGE_FALLBACK_KEY = 'jungle_run_profile_fallback';

export const DEFAULT_KEY_BINDINGS = {
  jump: ['Space', 'KeyW', 'ArrowUp'],
  slide: ['KeyS', 'ArrowDown'],
  interact: ['KeyE', 'ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP']
};

export const INITIAL_SETTINGS: GameSettings = {
  musicVolume: 0.7,
  sfxVolume: 0.8,
  isMuted: false,
  screenShake: true,
  particleDensity: 'high',
  showTouchControls: 'auto',
  keyBindings: DEFAULT_KEY_BINDINGS
};

export const INITIAL_STATS: PlayerStats = {
  totalRuns: 0,
  totalDistanceMeters: 0,
  totalCoins: 0,
  totalRelics: 0,
  highScore: 0,
  longestDistanceMeters: 0,
  mostVinesSwungInSingleRun: 0,
  totalHazardsAvoided: 0,
  lastPlayedTimestamp: Date.now()
};

export const INITIAL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_steps',
    title: 'First Expedition',
    description: 'Travel 100 meters through the dense jungle.',
    category: 'survival',
    progress: 0,
    maxProgress: 100,
    unlocked: false
  },
  {
    id: 'deep_trek',
    title: 'Deep Canopy Trek',
    description: 'Survive for 500 meters in a single run.',
    category: 'survival',
    progress: 0,
    maxProgress: 500,
    unlocked: false
  },
  {
    id: 'jungle_sovereign',
    title: 'Jungle Sovereign',
    description: 'Reach an incredible 1,500 meters in one adventure.',
    category: 'milestone',
    progress: 0,
    maxProgress: 1500,
    unlocked: false
  },
  {
    id: 'vine_apprentice',
    title: 'Liana Leaper',
    description: 'Swing across 3 vines in a single run.',
    category: 'traversal',
    progress: 0,
    maxProgress: 3,
    unlocked: false
  },
  {
    id: 'vine_master',
    title: 'Vine Virtuoso',
    description: 'Successfully swing across 15 vines across all runs.',
    category: 'traversal',
    progress: 0,
    maxProgress: 15,
    unlocked: false
  },
  {
    id: 'coin_collector',
    title: 'Treasure Seeker',
    description: 'Collect 100 gold coins from ancient trails.',
    category: 'treasure',
    progress: 0,
    maxProgress: 100,
    unlocked: false
  },
  {
    id: 'relic_hunter',
    title: 'Golden Idol Hunter',
    description: 'Recover 5 ancient golden relics and idols.',
    category: 'treasure',
    progress: 0,
    maxProgress: 5,
    unlocked: false
  },
  {
    id: 'crocodile_dodger',
    title: 'Crocodile Dodger',
    description: 'Leap over 10 snapping swamp crocodiles.',
    category: 'survival',
    progress: 0,
    maxProgress: 10,
    unlocked: false
  },
  {
    id: 'boulder_survivor',
    title: 'Idol Raider',
    description: 'Dodge or slide beneath 5 rolling boulders.',
    category: 'survival',
    progress: 0,
    maxProgress: 5,
    unlocked: false
  },
  {
    id: 'centurion',
    title: 'Tenacious Explorer',
    description: 'Embark on 10 jungle runs.',
    category: 'milestone',
    progress: 0,
    maxProgress: 10,
    unlocked: false
  },
  {
    id: 'high_scorer',
    title: 'Legendary Score',
    description: 'Achieve a score of 5,000 points or higher in one run.',
    category: 'milestone',
    progress: 0,
    maxProgress: 5000,
    unlocked: false
  }
];

export const INITIAL_SKINS: CharacterSkin[] = [
  {
    id: 'harry',
    name: 'Adventurer Harry',
    title: 'The Legendary Explorer',
    description: 'A daring archaeologist inspired by 1980s retro jungle legends.',
    unlocked: true,
    unlockRequirement: 'Available from the start',
    colorTheme: {
      shirt: '#c2a649',
      pants: '#4a3728',
      hat: '#3d2817',
      accent: '#f59e0b'
    }
  },
  {
    id: 'maya',
    name: 'Explorer Maya',
    title: 'The Cartographer',
    description: 'An agile ruins surveyor with unmatched agility on swinging vines.',
    unlocked: false,
    unlockRequirement: 'Collect 50 total gold coins',
    colorTheme: {
      shirt: '#10b981',
      pants: '#1e293b',
      hat: '#064e3b',
      accent: '#34d399'
    }
  },
  {
    id: 'leo',
    name: 'Ranger Leo',
    title: 'Wilderness Sentinel',
    description: 'A rugged protector of primeval rainforests who knows every crocodile swamp.',
    unlocked: false,
    unlockRequirement: 'Travel a total distance of 1,000 meters',
    colorTheme: {
      shirt: '#ef4444',
      pants: '#374151',
      hat: '#991b1b',
      accent: '#f87171'
    }
  }
];

export function createDefaultProfile(): LocalProfile {
  return {
    schemaVersion: 1,
    lastUpdated: Date.now(),
    selectedCharacterId: 'harry',
    stats: { ...INITIAL_STATS },
    settings: { ...INITIAL_SETTINGS },
    achievements: JSON.parse(JSON.stringify(INITIAL_ACHIEVEMENTS)),
    unlockedSkins: JSON.parse(JSON.stringify(INITIAL_SKINS)),
    recentRuns: []
  };
}

class StorageManager {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private openDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return Promise.resolve(null);
    }
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          console.warn('IndexedDB failed to open; falling back to LocalStorage');
          resolve(null);
        };
      } catch (err) {
        console.warn('IndexedDB exception; falling back to LocalStorage', err);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  public async loadProfile(): Promise<LocalProfile> {
    try {
      const db = await this.openDB();
      if (db) {
        const record = await new Promise<LocalProfile | null>((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(PROFILE_KEY);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });

        if (record) {
          return this.migrateAndValidateProfile(record);
        }
      }
    } catch (e) {
      console.warn('Error reading from IndexedDB:', e);
    }

    // Fallback: LocalStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return this.migrateAndValidateProfile(parsed);
        }
      }
    } catch (e) {
      console.warn('Error reading from LocalStorage:', e);
    }

    // Default profile
    const def = createDefaultProfile();
    await this.saveProfile(def);
    return def;
  }

  public async saveProfile(profile: LocalProfile): Promise<boolean> {
    profile.lastUpdated = Date.now();
    let idbSuccess = false;

    try {
      const db = await this.openDB();
      if (db) {
        idbSuccess = await new Promise<boolean>((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(profile, PROFILE_KEY);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        });
      }
    } catch (e) {
      console.warn('Error saving to IndexedDB:', e);
    }

    // Always mirror to localStorage as backup
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, JSON.stringify(profile));
        return true;
      }
    } catch (e) {
      console.warn('Error saving to LocalStorage:', e);
    }

    return idbSuccess;
  }

  private migrateAndValidateProfile(data: any): LocalProfile {
    const fallback = createDefaultProfile();
    if (!data || typeof data !== 'object') return fallback;

    // Schema version check & field migration
    const profile: LocalProfile = {
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

    return profile;
  }

  private mergeAchievements(savedAchievements: any[]): Achievement[] {
    const list = JSON.parse(JSON.stringify(INITIAL_ACHIEVEMENTS));
    if (!Array.isArray(savedAchievements)) return list;

    const map = new Map<string, any>(savedAchievements.map(a => [a.id, a]));
    return list.map((initial: Achievement) => {
      const saved = map.get(initial.id);
      if (saved) {
        return {
          ...initial,
          progress: typeof saved.progress === 'number' ? saved.progress : initial.progress,
          unlocked: Boolean(saved.unlocked),
          unlockedAt: saved.unlockedAt
        };
      }
      return initial;
    });
  }

  private mergeSkins(savedSkins: any[]): CharacterSkin[] {
    const list = JSON.parse(JSON.stringify(INITIAL_SKINS));
    if (!Array.isArray(savedSkins)) return list;

    const map = new Map<string, any>(savedSkins.map(s => [s.id, s]));
    return list.map((initial: CharacterSkin) => {
      const saved = map.get(initial.id);
      if (saved) {
        return {
          ...initial,
          unlocked: initial.id === 'harry' ? true : Boolean(saved.unlocked)
        };
      }
      return initial;
    });
  }
}

export const storageManager = new StorageManager();
