/**
 * Typed Tauri transport for native-owned profile operations.
 * Browser routing never calls this transport; IPC failures propagate to the UI,
 * rather than causing a switch to a separate browser save.
 * @module data/native
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { GameSettings, LocalProfile, RunRecord, RecordOutcome } from './types.ts';

/** Runtime detection provided by Tauri v2, safe in standalone browsers and tests. */
export const hasNativeBackend = isTauri;

/** Command argument/result pairs retaining the native camel-case JSON contracts. */
export interface NativeOperations {
  /** Return null only when no native profile file exists. */
  loadProfile: {
    /** No payload is needed for the app-owned profile path. */
    args: Record<string, never>;
    /** Existing aggregate, or null only for a missing file. */
    result: LocalProfile | null;
  };
  /** Migrate once or create defaults; never overwrite an existing native profile. */
  initializeProfile: {
    /** First-install migration input. */
    args: {
      /** Legacy data is validated by Rust; null requests shared defaults. */
      legacyProfile: LocalProfile | null;
    };
    /** Native aggregate after initialization, or the already existing native save. */
    result: LocalProfile;
  };
  /** Persist a shallow settings patch in Rust. */
  updateSettings: {
    /** Preference patch envelope. */
    args: {
      /** Changed fields; key bindings replace the complete mapping. */
      settings: Partial<GameSettings>;
    };
    /** Committed profile containing the validated patch. */
    result: LocalProfile;
  };
  /** Persist a known unlocked explorer choice. */
  selectCharacter: {
    /** Explorer selection envelope. */
    args: {
      /** Known unlocked explorer ID. */
      characterId: string;
    };
    /** Profile after persisting selection. */
    result: LocalProfile;
  };
  /** Accumulate totals/unlocks and save a completed expedition. */
  recordRun: {
    /** Completion metrics envelope. */
    args: {
      /** Run before native-generated identity and completion time. */
      runData: Omit<RunRecord, 'id' | 'timestamp'>;
    };
    /** Persisted progression result and newly unlocked display names. */
    result: RecordOutcome;
  };
  /** Produce indented JSON off the WebView thread. */
  exportData: {
    /** Export uses the native cache, not a frontend-supplied aggregate. */
    args: Record<string, never>;
    /** Indented JSON backup serialized in Rust. */
    result: string;
  };
  /** Normalize and persist pasted backup JSON without speculative UI updates. */
  importData: {
    /** Pasted backup envelope. */
    args: {
      /** Raw JSON text normalized and validated before any native write. */
      jsonString: string;
    };
    /** Committed restored aggregate. */
    result: LocalProfile;
  };
  /** Persist defaults without reimporting any retained legacy browser save. */
  resetAllData: {
    /** Reset requires no browser data and does not rerun legacy migration. */
    args: Record<string, never>;
    /** Successfully persisted default aggregate. */
    result: LocalProfile;
  };
}

/** Invoke a typed operation; Rust validates the envelope and returns explicit failures. */
export async function nativeData<K extends keyof NativeOperations>(
  operation: K,
  args: NativeOperations[K]['args']
): Promise<NativeOperations[K]['result']> {
  try {
    return await invoke<NativeOperations[K]['result']>('native_data', {
      request: { operation, ...args }
    });
  } catch (error) {
    throw new Error(`Native data ${operation} failed: ${String(error)}`, { cause: error });
  }
}
