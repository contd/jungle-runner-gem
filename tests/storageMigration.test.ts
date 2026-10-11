/**
 * Legacy browser storage migration reads without writing a new browser profile.
 * These tests stub only window/LocalStorage and preserve raw legacy fields for Rust
 * validation. They do not replace the separate native atomic-file regression tests.
 * @module tests/storageMigration
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProfile, storageManager } from '../src/data/storage.ts';

describe('Strict browser-to-native migration reads', () => {
  /** Read-only mirror mock; native initialization must not write or clear it. */
  const localStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('window', { localStorage });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Valid existing JSON is returned without a browser write or backup deletion. */
  it('reads the existing mirror unchanged for native validation', async () => {
    const profile = createDefaultProfile();
    profile.stats.highScore = 9000;
    localStorage.getItem.mockReturnValue(JSON.stringify(profile));
    expect(await storageManager.loadExistingProfile(true)).toEqual(profile);
    expect(localStorage.getItem).toHaveBeenCalledWith('jungle_run_profile_fallback');
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  /** Missing data must remain absence, not a generated/saved default aggregate. */
  it('returns null when no legacy mirror exists', async () => {
    localStorage.getItem.mockReturnValue(null);
    expect(await storageManager.loadExistingProfile(true)).toBeNull();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  /** Rust, not the migration reader, fills partial older schemas and validates their fields. */
  it('preserves partial legacy objects without frontend normalization', async () => {
    const partial = { stats: { highScore: 1234 } };
    localStorage.getItem.mockReturnValue(JSON.stringify(partial));
    expect(await storageManager.loadExistingProfile(true)).toEqual(partial);
  });

  /** Corrupt/unreadable legacy data blocks native default creation instead of losing progress. */
  it.each(['{', '[]', 'null'])('rejects invalid legacy JSON %s', async (json) => {
    localStorage.getItem.mockReturnValue(json);
    await expect(storageManager.loadExistingProfile(true)).rejects.toThrow('Cannot read existing browser profile');
    expect(console.warn).toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  /** Permission/read failures are surfaced, not mistaken for a new installation. */
  it('rejects inaccessible legacy storage', async () => {
    localStorage.getItem.mockImplementation(() => { throw new Error('storage denied'); });
    await expect(storageManager.loadExistingProfile(true)).rejects.toThrow('Cannot read existing browser profile');
  });

  /** Retrying native migration retries IndexedDB rather than replaying a rejected promise. */
  it('reopens IndexedDB after a transient opening failure', async () => {
    const open = vi.fn(() => {
      const request = {
        error: new Error('temporary database failure'),
        onerror: null as (() => void) | null
      };
      queueMicrotask(() => request.onerror?.());
      return request;
    });
    vi.stubGlobal('window', { localStorage, indexedDB: { open } });
    await expect(storageManager.loadExistingProfile(true)).rejects.toThrow('Cannot read existing browser profile');
    await expect(storageManager.loadExistingProfile(true)).rejects.toThrow('Cannot read existing browser profile');
    expect(open).toHaveBeenCalledTimes(2);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  /** Standalone browser loading retains its existing recovery-to-defaults behavior. */
  it('allows nonstrict browser recovery after malformed mirror JSON', async () => {
    localStorage.getItem.mockReturnValue('{');
    const profile = await storageManager.loadProfile();
    expect(profile.schemaVersion).toBe(1);
    expect(profile.stats.totalRuns).toBe(0);
    expect(localStorage.setItem).toHaveBeenCalled();
  });
});
