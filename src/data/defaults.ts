/**
 * Lightweight frontend view of the Rust-owned default catalog.
 * Initial React rendering needs this data synchronously; persistence and
 * browser-only progression are separate lazy modules, not part of this view.
 * @module data/defaults
 */
import catalog from '../../src-tauri/src/data/default-profile.json';
import type { LocalProfile, PlayerStats, GameSettings, Achievement, CharacterSkin, KeyBindings } from './types.ts';

/** Narrow JSON discriminators while rejecting a malformed bundled catalog. */
function catalogEnum<T extends string>(value: string, values: readonly T[]): T {
  const result = values.find(candidate => candidate === value);
  if (!result) throw new Error(`Invalid default catalog value: ${value}`);
  return result;
}

/** KeyboardEvent.code aliases sourced from the same catalog used by Rust. */
export const DEFAULT_KEY_BINDINGS: KeyBindings = catalog.settings.keyBindings;
/** Initial preferences with checked presentation discriminators. */
export const INITIAL_SETTINGS: GameSettings = {
  ...catalog.settings,
  particleDensity: catalogEnum(catalog.settings.particleDensity, ['low', 'medium', 'high'] as const),
  showTouchControls: catalogEnum(catalog.settings.showTouchControls, ['auto', 'always', 'never'] as const)
};
/** Zeroed lifetime metrics; new profiles stamp their own creation times. */
export const INITIAL_STATS: PlayerStats = { ...catalog.stats };
/** Shared known goals; IDs and target values remain unchanged by native migration. */
export const INITIAL_ACHIEVEMENTS: Achievement[] = catalog.achievements.map(entry => ({
  ...entry,
  category: catalogEnum(entry.category, ['survival', 'treasure', 'traversal', 'milestone'] as const)
}));
/** Shared explorer catalog with Harry initially unlocked. */
export const INITIAL_SKINS: CharacterSkin[] = catalog.unlockedSkins;

/** Create an independent rendering/browser profile; Rust owns native initialization. */
export function createDefaultProfile(): LocalProfile {
  const now = Date.now();
  return {
    schemaVersion: catalog.schemaVersion,
    lastUpdated: now,
    selectedCharacterId: catalog.selectedCharacterId,
    stats: { ...INITIAL_STATS, lastPlayedTimestamp: now },
    settings: structuredClone(INITIAL_SETTINGS),
    achievements: structuredClone(INITIAL_ACHIEVEMENTS),
    unlockedSkins: structuredClone(INITIAL_SKINS),
    recentRuns: []
  };
}
