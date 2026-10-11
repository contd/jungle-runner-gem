/**
 * Frontend/native routing, migration, ordering, and error-notification contract tests.
 * IPC is mocked here to inspect exact requests; Rust separately tests its real
 * Tauri handler, progression rules, atomic writes, validation, and concurrent callers.
 * Browser storage must never be rewritten or used as an IPC-error fallback.
 * @module tests/nativeData
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalProfile, RunRecord } from '../src/data/types.ts';

/** Hoisted transport mock preserves deterministic native/browser routing per test. */
const transport = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true)
}));
vi.mock('@tauri-apps/api/core', () => transport);

import { LocalGameRepository } from '../src/data/repository.ts';
import { createDefaultProfile, storageManager } from '../src/data/storage.ts';

/** Representative completed expedition matching the Rust/browser accumulation fixtures. */
const runData: Omit<RunRecord, 'id' | 'timestamp'> = {
  score: 1200, distanceMeters: 450, coinsCollected: 35, relicsCollected: 2,
  hazardsAvoided: 6, vinesSwung: 4, causeOfDeath: 'crocodile',
  characterId: 'harry', seed: 1337, mode: 'endless'
};

/** Inspect the operation name sent to the registered native command. */
function operationNames(): string[] {
  return transport.invoke.mock.calls.map(([, args]) => args.request.operation);
}

describe('Native data bridge', () => {
  /** Committed backend snapshot, deliberately not mutated by frontend operations. */
  let profile: LocalProfile;
  /** Fresh UI repository cache/queue for each test. */
  let repository: LocalGameRepository;

  beforeEach(() => {
    vi.restoreAllMocks();
    transport.invoke.mockReset();
    transport.isTauri.mockReturnValue(true);
    profile = createDefaultProfile();
    repository = new LocalGameRepository();
    transport.invoke.mockResolvedValue(profile);
  });

  /** Native state wins, and concurrent consumers share one IPC load without legacy reads. */
  it('deduplicates loading and skips browser storage when native data exists', async () => {
    const read = vi.spyOn(storageManager, 'loadExistingProfile');
    const [first, second] = await Promise.all([repository.getProfile(), repository.getProfile()]);
    expect(first).toBe(second);
    expect(operationNames()).toEqual(['loadProfile']);
    expect(read).not.toHaveBeenCalled();
  });

  /** Only a null native response requests one strict legacy read and initialization. */
  it('migrates browser progress once without writing or deleting the legacy save', async () => {
    const legacy = createDefaultProfile();
    legacy.stats.highScore = 9000;
    const read = vi.spyOn(storageManager, 'loadExistingProfile').mockResolvedValue(legacy);
    const write = vi.spyOn(storageManager, 'saveProfile');
    transport.invoke.mockResolvedValueOnce(null).mockResolvedValueOnce(legacy);
    expect((await repository.getProfile()).stats.highScore).toBe(9000);
    await repository.getProfile();
    expect(read).toHaveBeenCalledExactlyOnceWith(true);
    expect(transport.invoke).toHaveBeenLastCalledWith('native_data', {
      request: { operation: 'initializeProfile', legacyProfile: legacy }
    });
    expect(write).not.toHaveBeenCalled();
  });

  /** New installs explicitly initialize Rust defaults rather than manufacture a browser save. */
  it('initializes a new native profile when both storage sources are absent', async () => {
    vi.spyOn(storageManager, 'loadExistingProfile').mockResolvedValue(null);
    transport.invoke.mockResolvedValueOnce(null).mockResolvedValueOnce(profile);
    await repository.getProfile();
    expect(transport.invoke).toHaveBeenLastCalledWith('native_data', {
      request: { operation: 'initializeProfile', legacyProfile: null }
    });
  });

  /** Corrupt native state cannot be hidden behind a second browser save; retry is explicit. */
  it('propagates failed native loads and allows retry without browser fallback', async () => {
    const read = vi.spyOn(storageManager, 'loadExistingProfile');
    transport.invoke.mockRejectedValueOnce('native profile corrupt');
    await expect(repository.getProfile()).rejects.toThrow('native profile corrupt');
    expect(read).not.toHaveBeenCalled();
    expect(await repository.getProfile()).toBe(profile);
    expect(operationNames()).toEqual(['loadProfile', 'loadProfile']);
  });

  /** Unreadable legacy data is not replaced by newly created defaults. */
  it('stops initialization when strict legacy reading fails', async () => {
    vi.spyOn(storageManager, 'loadExistingProfile').mockRejectedValue(new Error('legacy unavailable'));
    transport.invoke.mockResolvedValueOnce(null);
    await expect(repository.getProfile()).rejects.toThrow('legacy unavailable');
    expect(operationNames()).toEqual(['loadProfile']);
  });

  /** Observer snapshots must follow successful native responses, not optimistic local mutation. */
  it('commits settings only after native persistence and does not notify on failure', async () => {
    await repository.getProfile();
    const listener = vi.fn();
    repository.subscribe(listener);
    transport.invoke.mockRejectedValueOnce('disk full');
    await expect(repository.updateSettings({ musicVolume: 0.2 })).rejects.toThrow('disk full');
    expect((await repository.getProfile()).settings.musicVolume).toBe(0.7);
    expect(listener).toHaveBeenCalledTimes(1);
    const saved = structuredClone(profile);
    saved.settings.musicVolume = 0.2;
    transport.invoke.mockResolvedValueOnce(saved);
    await repository.updateSettings({ musicVolume: 0.2 });
    expect(listener).toHaveBeenLastCalledWith(saved);
  });

  /** Failed writes do not poison the ordering queue for the next settings operation. */
  it('serializes rapid patches in order and continues after an earlier failure', async () => {
    await repository.getProfile();
    transport.invoke.mockRejectedValueOnce('write failed').mockResolvedValueOnce(profile);
    const results = await Promise.allSettled([
      repository.updateSettings({ musicVolume: 0.1 }),
      repository.updateSettings({ sfxVolume: 0.4 })
    ]);
    expect(results.map(result => result.status)).toEqual(['rejected', 'fulfilled']);
    expect(transport.invoke.mock.calls.slice(1).map(([, args]) => args.request.settings))
      .toEqual([{ musicVolume: 0.1 }, { sfxVolume: 0.4 }]);
  });

  /** Run metrics are sent untouched; totals/unlocks come exclusively from the native outcome. */
  it('delegates complete run progression and returns native outcome flags', async () => {
    await repository.getProfile();
    const saved = structuredClone(profile);
    saved.stats.totalRuns = 1;
    const outcome = {
      profile: saved, newHighScore: true, newLongestDistance: true,
      unlockedAchievements: ['First Expedition'], unlockedSkins: []
    };
    transport.invoke.mockResolvedValueOnce(outcome);
    expect(await repository.recordRun(runData)).toBe(outcome);
    expect(transport.invoke).toHaveBeenLastCalledWith('native_data', {
      request: { operation: 'recordRun', runData }
    });
    expect((await repository.getProfile()).stats.totalRuns).toBe(1);
  });

  /** A UI observer failure must not invite recording an already committed expedition again. */
  it('reports observer errors without rejecting a committed run or skipping other observers', async () => {
    const failingObserver = vi.fn(() => { throw new Error('UI observer failed'); });
    const healthyObserver = vi.fn();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    repository.subscribe(failingObserver);
    repository.subscribe(healthyObserver);
    await repository.getProfile();
    const saved = structuredClone(profile);
    saved.stats.totalRuns = 1;
    const outcome = {
      profile: saved, newHighScore: false, newLongestDistance: false,
      unlockedAchievements: [], unlockedSkins: []
    };
    transport.invoke.mockResolvedValueOnce(outcome);
    await expect(repository.recordRun(runData)).resolves.toBe(outcome);
    expect(failingObserver).toHaveBeenCalledOnce();
    expect(healthyObserver).toHaveBeenCalledExactlyOnceWith(saved);
    expect(log).toHaveBeenCalledWith(
      'Profile observer failed after a committed data update:', expect.any(Error)
    );
    expect(operationNames()).toEqual(['loadProfile', 'recordRun']);
  });

  /** Native serialization/import/selection/reset preserve existing UI APIs without JS writes. */
  it('delegates backup, import, selection, and reset to native operations', async () => {
    await repository.getProfile();
    transport.invoke.mockResolvedValueOnce('native JSON');
    expect(await repository.exportData()).toBe('native JSON');
    transport.invoke.mockResolvedValueOnce(profile);
    expect(await repository.importData('{}')).toBe(true);
    await repository.selectCharacter('harry');
    await repository.resetAllData();
    expect(operationNames()).toEqual([
      'loadProfile', 'exportData', 'importData', 'selectCharacter', 'resetAllData'
    ]);
  });

  /** A rejected backup never replaces the UI snapshot or reports successful restoration. */
  it('rejects invalid native imports and retains the prior snapshot', async () => {
    await repository.getProfile();
    transport.invoke.mockRejectedValueOnce('invalid backup');
    await expect(repository.importData('[]')).rejects.toThrow('invalid backup');
    expect(await repository.getProfile()).toBe(profile);
  });

  /** Ordinary web builds keep the original progression implementation and issue no IPC. */
  it('retains browser gameplay and progression without invoking Tauri', async () => {
    transport.isTauri.mockReturnValue(false);
    const outcome = await repository.recordRun(runData);
    expect(outcome.profile.stats.totalRuns).toBe(1);
    expect(outcome.newHighScore).toBe(true);
    expect(transport.invoke).not.toHaveBeenCalled();
  });
});
