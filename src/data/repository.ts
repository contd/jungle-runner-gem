/**
 * Runtime-selecting profile repository and React subscription boundary.
 * Tauri owns persistence/progression in Rust; standalone browsers lazy-load their
 * existing implementation. Browser storage is read once only if a native save
 * does not exist, and retained untouched as a legacy backup after migration.
 * @module data/repository
 */
import type { GameSettings, LocalProfile, RunRecord, RecordOutcome } from './types.ts';
import type { BrowserGameRepository } from './browserRepository.ts';
import { hasNativeBackend, nativeData } from './native.ts';

/**
 * Cache committed native snapshots and notify UI observers after successful operations.
 * Loads are deduplicated; mutations are queued in issue order so rapid slider
 * changes cannot display stale responses or overwrite each other's preferences.
 */
export class LocalGameRepository {
  /** Snapshot last returned by the selected backend, never a speculative native mutation. */
  private currentProfile: LocalProfile | null = null;
  /** In-flight initial load reused by concurrent profile consumers. */
  private loading: Promise<LocalProfile> | null = null;
  /** Browser-only implementation; native runs never initialize its progression repository. */
  private browser: Promise<BrowserGameRepository> | null = null;
  /** Profile snapshot observers consumed by the React shell. */
  private listeners = new Set<(profile: LocalProfile) => void>();
  /** Settlement-only queue tail; individual operation failures still reject their caller. */
  private pending: Promise<void> = Promise.resolve();

  /** Load the browser implementation only for the non-Tauri route. */
  private browserRepository(): Promise<BrowserGameRepository> {
    this.browser ??= import('./browserRepository.ts').then(({ BrowserGameRepository }) => new BrowserGameRepository());
    return this.browser;
  }

  /** Load native state first; migrate browser data only for a confirmed absent native save. */
  private async load(): Promise<LocalProfile> {
    if (!hasNativeBackend()) return (await this.browserRepository()).getProfile();
    const profile = await nativeData('loadProfile', {});
    if (profile) return profile;
    const { storageManager } = await import('./storage.ts');
    const legacyProfile = await storageManager.loadExistingProfile(true);
    return nativeData('initializeProfile', { legacyProfile });
  }

  /** Return cached state or share one initial load; failed loads can be explicitly retried. */
  public async getProfile(): Promise<LocalProfile> {
    if (this.currentProfile) return this.currentProfile;
    this.loading ??= this.load();
    try {
      this.currentProfile = await this.loading;
      return this.currentProfile;
    } finally {
      this.loading = null;
    }
  }

  /** Observe committed snapshots, with immediate replay when loaded; returns an unsubscribe handle. */
  public subscribe(callback: (profile: LocalProfile) => void): () => void {
    this.listeners.add(callback);
    if (this.currentProfile) callback(this.currentProfile);
    return () => { this.listeners.delete(callback); };
  }

  /**
   * Replace the snapshot only after backend success and notify observers.
   * Observer errors are logged separately: a failed UI callback must not turn an
   * already persisted run into a retryable write failure and duplicate that run.
   */
  private commit(profile: LocalProfile): LocalProfile {
    this.currentProfile = profile;
    for (const callback of this.listeners) {
      try {
        callback(profile);
      } catch (error) {
        console.error('Profile observer failed after a committed data update:', error);
      }
    }
    return profile;
  }

  /** Serialize operations without making one failure poison subsequent queued requests. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  /** Shallow settings patch performed by Rust in native builds, including write-before-notify. */
  public updateSettings(settings: Partial<GameSettings>): Promise<LocalProfile> {
    return this.enqueue(async () => {
      await this.getProfile();
      return this.commit(hasNativeBackend()
        ? await nativeData('updateSettings', { settings })
        : await (await this.browserRepository()).updateSettings(settings));
    });
  }

  /** Select a known unlocked explorer; native validation errors are not silently ignored. */
  public selectCharacter(characterId: string): Promise<LocalProfile> {
    return this.enqueue(async () => {
      await this.getProfile();
      return this.commit(hasNativeBackend()
        ? await nativeData('selectCharacter', { characterId })
        : await (await this.browserRepository()).selectCharacter(characterId));
    });
  }

  /** Record metrics using the selected backend's counting rules and committed outcome. */
  public recordRun(runData: Omit<RunRecord, 'id' | 'timestamp'>): Promise<RecordOutcome> {
    return this.enqueue(async () => {
      await this.getProfile();
      const result = hasNativeBackend()
        ? await nativeData('recordRun', { runData })
        : await (await this.browserRepository()).recordRun(runData);
      this.commit(result.profile);
      return result;
    });
  }

  /** Export after earlier queued mutations; native JSON serialization stays in Rust. */
  public exportData(): Promise<string> {
    return this.enqueue(async () => {
      await this.getProfile();
      return hasNativeBackend()
        ? nativeData('exportData', {})
        : (await this.browserRepository()).exportData();
    });
  }

  /**
   * Import and notify only on success. Native malformed backups/write failures
   * reject explicitly; browsers retain their existing boolean compatibility contract.
   */
  public importData(jsonString: string): Promise<boolean> {
    return this.enqueue(async () => {
      await this.getProfile();
      if (hasNativeBackend()) {
        this.commit(await nativeData('importData', { jsonString }));
        return true;
      }
      const browser = await this.browserRepository();
      const imported = await browser.importData(jsonString);
      if (imported) this.commit(await browser.getProfile());
      return imported;
    });
  }

  /** Reset through the selected backend; an existing native reset prevents legacy reimport. */
  public resetAllData(): Promise<LocalProfile> {
    return this.enqueue(async () => {
      await this.getProfile();
      return this.commit(hasNativeBackend()
        ? await nativeData('resetAllData', {})
        : await (await this.browserRepository()).resetAllData());
    });
  }
}

/** Application-wide repository retaining the existing UI-facing API. */
export const gameRepository = new LocalGameRepository();
