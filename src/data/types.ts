/**
 * Jungle Run - Data Models and Storage Interfaces
 */

export type GameMode = 'endless' | 'practice' | 'challenge';

export interface RunRecord {
  id: string;
  timestamp: number;
  score: number;
  distanceMeters: number;
  coinsCollected: number;
  relicsCollected: number;
  hazardsAvoided: number;
  vinesSwung: number;
  causeOfDeath: string;
  characterId: string;
  seed: number;
  mode: GameMode;
}

export interface PlayerStats {
  totalRuns: number;
  totalDistanceMeters: number;
  totalCoins: number;
  totalRelics: number;
  highScore: number;
  longestDistanceMeters: number;
  mostVinesSwungInSingleRun: number;
  totalHazardsAvoided: number;
  lastPlayedTimestamp: number;
}

export interface KeyBindings {
  jump: string[];
  slide: string[];
  interact: string[];
  pause: string[];
}

export interface GameSettings {
  musicVolume: number; // 0.0 to 1.0
  sfxVolume: number;   // 0.0 to 1.0
  isMuted: boolean;
  screenShake: boolean;
  particleDensity: 'low' | 'medium' | 'high';
  showTouchControls: 'auto' | 'always' | 'never';
  keyBindings: KeyBindings;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: 'survival' | 'treasure' | 'traversal' | 'milestone';
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  unlockedAt?: number;
}

export interface CharacterSkin {
  id: string;
  name: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockRequirement: string;
  colorTheme: {
    shirt: string;
    pants: string;
    hat: string;
    accent: string;
  };
}

export interface LocalProfile {
  schemaVersion: number;
  lastUpdated: number;
  selectedCharacterId: string;
  stats: PlayerStats;
  settings: GameSettings;
  achievements: Achievement[];
  unlockedSkins: CharacterSkin[];
  recentRuns: RunRecord[];
}

export type SyncState = 'local_only' | 'pending' | 'synced' | 'conflict';

export interface CloudSyncMetadata {
  syncState: SyncState;
  lastSyncTimestamp: number | null;
  remoteVersion: number | null;
  cloudAccountId: string | null;
}
