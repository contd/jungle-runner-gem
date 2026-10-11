/**
 * Frontend view of the native/browser profile and progression contracts.
 * Distances use game meters; timestamps use milliseconds since the Unix epoch.
 * These interfaces describe backend snapshots. Rust validates native IPC and
 * imported profiles; browser fallback validation remains intentionally permissive.
 * @module data/types
 */

/** Run rules: normal lives, practice recovery, or a user-supplied generation seed. */
export type GameMode = 'endless' | 'practice' | 'challenge';

/** Completed expedition, enriched with identity and completion time by the repository. */
export interface RunRecord {
  /** Locally generated identifier used to key history rows. */
  id: string;
  /** Completion time in epoch milliseconds. */
  timestamp: number;
  /** Final integer score including distance, collectibles, and combo bonuses. */
  score: number;
  /** Furthest recorded distance in game meters, not physical-world meters. */
  distanceMeters: number;
  /** Number of coins picked up, independent of their multiplied score. */
  coinsCollected: number;
  /** Number of relic pickups contributing to lifetime progression. */
  relicsCollected: number;
  /** Hazard-avoidance events reported by the scene; not every missed obstacle. */
  hazardsAvoided: number;
  /** Vine releases completed during the run. */
  vinesSwung: number;
  /** Scene-provided cause code, retained verbatim for history and progression. */
  causeOfDeath: string;
  /** Skin identifier used for this run. */
  characterId: string;
  /** Generation seed stored for reference; other random effects are not replayed. */
  seed: number;
  /** Rules under which this expedition was played. */
  mode: GameMode;
}

/** Lifetime totals and single-run maxima accumulated from recorded expeditions. */
export interface PlayerStats {
  /** Count of recorded runs across modes. */
  totalRuns: number;
  /** Sum of completed-run distances in game meters. */
  totalDistanceMeters: number;
  /** Lifetime coin pickups; used for Maya's unlock. */
  totalCoins: number;
  /** Lifetime relic pickups. */
  totalRelics: number;
  /** Greatest completed-run score. */
  highScore: number;
  /** Greatest completed-run distance in game meters. */
  longestDistanceMeters: number;
  /** Greatest number of vine releases in one run. */
  mostVinesSwungInSingleRun: number;
  /** Sum of hazard-avoidance events supplied by recorded runs. */
  totalHazardsAvoided: number;
  /** Most recent recorded play time in epoch milliseconds. */
  lastPlayedTimestamp: number;
}

/** KeyboardEvent.code values grouped by logical action, allowing multiple aliases. */
export interface KeyBindings {
  /** Codes for jumping or releasing an attached vine. */
  jump: string[];
  /** Codes for the grounded slide action. */
  slide: string[];
  /** Codes for attempting nearby vine attachment. */
  interact: string[];
  /** Codes for toggling play/pause in the application shell. */
  pause: string[];
}

/** Persisted preferences; some presentation options are reserved for future wiring. */
export interface GameSettings {
  /** Music gain preference in [0, 1], attenuated further by the audio mixer. */
  musicVolume: number;
  /** Sound-effect gain preference in [0, 1]. */
  sfxVolume: number;
  /** Master mute state, preserving the individual gain preferences. */
  isMuted: boolean;
  /** Whether the scene may apply camera shakes on impacts and relic pickups. */
  screenShake: boolean;
  /** Stored particle quality preference; currently not applied by the scene. */
  particleDensity: 'low' | 'medium' | 'high';
  /** On-screen buttons: capability detection, unconditional display, or hidden. */
  showTouchControls: 'auto' | 'always' | 'never';
  /** Persisted action-to-key mapping consumed by the input manager. */
  keyBindings: KeyBindings;
}

/** Catalog entry plus persisted progress, matched by stable ID on profile loading. */
export interface Achievement {
  /** Stable catalog key used by progression rules and saved-data merging. */
  id: string;
  /** Display title also returned in newly unlocked notifications. */
  title: string;
  /** Player-facing goal description; actual counting rules live in the repository. */
  description: string;
  /** Presentation grouping for the goal. */
  category: 'survival' | 'treasure' | 'traversal' | 'milestone';
  /** Current goal-specific progress; run recording caps this at the target. */
  progress: number;
  /** Target count, score, or game-meter distance for this achievement. */
  maxProgress: number;
  /** Persisted completion flag; completed achievements stop accumulating progress. */
  unlocked: boolean;
  /** First completion time in epoch milliseconds, absent before unlocking. */
  unlockedAt?: number;
}

/** Character selection metadata; the boot scene defines its own sprite palettes. */
export interface CharacterSkin {
  /** Stable key also embedded in Phaser texture and animation names. */
  id: string;
  /** Explorer display name returned by unlock notifications. */
  name: string;
  /** Short role subtitle shown for an unlocked explorer. */
  title: string;
  /** Flavor text describing the explorer. */
  description: string;
  /** Whether this explorer can be selected. */
  unlocked: boolean;
  /** Human-readable unlock condition displayed for locked explorers. */
  unlockRequirement: string;
  /** Catalog colors, not a dynamic replacement for boot-scene sprite textures. */
  colorTheme: {
    /** CSS shirt color. */
    shirt: string;
    /** CSS trouser color. */
    pants: string;
    /** CSS hat color. */
    hat: string;
    /** CSS accent color for presentation. */
    accent: string;
  };
}

/** Profile snapshot broadcast by the repository; native mutation authority resides in Rust. */
export interface LocalProfile {
  /** Saved-data schema revision; the current default is version 1. */
  schemaVersion: number;
  /** Native committed save time, or browser save-attempt time, in epoch milliseconds. */
  lastUpdated: number;
  /** Preferred explorer ID; new profiles select Harry. */
  selectedCharacterId: string;
  /** Lifetime totals and personal bests. */
  stats: PlayerStats;
  /** Audio, input, and presentation preferences. */
  settings: GameSettings;
  /** All known achievement entries, including locked ones. */
  achievements: Achievement[];
  /** All known skin entries, despite the historical `unlockedSkins` name. */
  unlockedSkins: CharacterSkin[];
  /** Newest-first run history: recording retains 30; loading accepts up to 50. */
  recentRuns: RunRecord[];
}

/** Committed progression outcome shared by native IPC and the browser fallback. */
export interface RecordOutcome {
  /** Successfully returned aggregate after recording. */
  profile: LocalProfile;
  /** Strict improvement over the prior highest score. */
  newHighScore: boolean;
  /** Strict improvement over the prior longest distance. */
  newLongestDistance: boolean;
  /** Newly unlocked achievement titles, not IDs. */
  unlockedAchievements: string[];
  /** Newly selectable explorer names, not IDs. */
  unlockedSkins: string[];
}

/** Future synchronization status; the current implementation stays local-only. */
export type SyncState = 'local_only' | 'pending' | 'synced' | 'conflict';

/** Reserved cloud bookkeeping, not currently embedded in the local profile. */
export interface CloudSyncMetadata {
  /** Current synchronization phase. */
  syncState: SyncState;
  /** Last successful sync time in epoch milliseconds, or null before syncing. */
  lastSyncTimestamp: number | null;
  /** Last known backend revision, or null without remote data. */
  remoteVersion: number | null;
  /** Backend account ID, or null for an unlinked local player. */
  cloudAccountId: string | null;
}
