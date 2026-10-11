/**
 * Async native/browser world-planning boundary.
 * Calls occur ahead of terrain consumption, not per physics frame. Batches are
 * serialized and continuation advances only on success, making retry deterministic.
 * @module game/systems/WorldGenerator
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { PlannedChunk, WorldBatch, WorldRequest, WorldState } from './worldTypes.ts';

/** Per-run frontend owner of a stateless native continuation. */
export class WorldGenerator {
  /** Last successful random/repeat state; zero is normalized only at run creation. */
  private state: WorldState;
  /** Settled queue tail; a failed request does not block later retries. */
  private pending: Promise<void> = Promise.resolve();

  /** Normalize seeds using the historical unsigned 32-bit/falsy-default semantics. */
  constructor(seed: number) {
    this.state = { rngState: (seed >>> 0) || 1337, lastChunkId: '' };
  }

  /** Request one segment at the actual selection-time distance. */
  public async next(distance: number): Promise<PlannedChunk> {
    const chunks = await this.generate([distance]);
    return chunks[0];
  }

  /**
   * Plan one through 64 ordered distances using Rust in Tauri or a lazy browser planner.
   * Failed native commands never route to browser generation or consume continuation.
   */
  public generate(distances: readonly number[]): Promise<PlannedChunk[]> {
    const ordered = [...distances];
    const result = this.pending.then(async () => {
      if (!ordered.length || ordered.length > 64
        || ordered.some(distance => !Number.isFinite(distance) || distance < 0 || distance > Number.MAX_SAFE_INTEGER)) {
        throw new Error('World batch requires 1 through 64 finite nonnegative safe distances');
      }
      const request: WorldRequest = { state: { ...this.state }, distances: ordered };
      let batch: WorldBatch;
      if (isTauri()) {
        try {
          batch = await invoke<WorldBatch>('native_world', { request });
        } catch (error) {
          throw new Error(`Native world generation failed: ${String(error)}`, { cause: error });
        }
      } else {
        const { planBrowserWorld } = await import('./ProceduralGenerator.ts');
        batch = planBrowserWorld(request);
      }
      if (batch.chunks.length !== ordered.length
        || !Number.isInteger(batch.state.rngState) || batch.state.rngState < 0 || batch.state.rngState > 0xffffffff
        || batch.state.lastChunkId !== batch.chunks[batch.chunks.length - 1].id) {
        throw new Error('World planner returned an invalid continuation or batch size');
      }
      this.state = { ...batch.state };
      return batch.chunks;
    });
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }
}
