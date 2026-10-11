/**
 * Native world routing, batching, retry and cross-language reference tests.
 * Rust reads the same checked-in vectors; these tests use the real browser planner
 * as the mock worker while independently checking fixed expected IDs/accumulators.
 * @module tests/worldGeneration
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixtures from './fixtures/world-parity.json';
import { WorldGenerator } from '../src/game/systems/WorldGenerator.ts';
import { CHUNK_CATALOG, planBrowserWorld, planTerrain, normalizeWorldChunk, validateJumpGaps } from '../src/game/systems/ProceduralGenerator.ts';
import { MAX_JUMP_GAP, MOVEMENT, runSpeedAtDistance } from '../src/game/systems/movement.ts';
import type { WorldRequest, ChunkDefinition } from '../src/game/systems/worldTypes.ts';

/** Controlled runtime/IPC boundary, with actual browser computation behind the mock. */
const transport = vi.hoisted(() => ({ isTauri: vi.fn(() => true), invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => transport);

describe('World planning bridge', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    transport.isTauri.mockReturnValue(true);
    transport.invoke.mockImplementation(async (_command: string, { request }: { request: WorldRequest }) =>
      planBrowserWorld(request));
  });

  /** Exact historical IDs and accumulator values are shared with the Rust test suite. */
  it.each(fixtures)('matches the checked-in sequence for seed $seed', async fixture => {
    const chunks = await new WorldGenerator(fixture.seed).generate(fixture.distances);
    expect(chunks.map(chunk => chunk.id)).toEqual(fixture.ids);
    const request = transport.invoke.mock.calls[0][1].request;
    expect(planBrowserWorld(request).state.rngState).toBe(fixture.rngState);
    expect(transport.invoke).toHaveBeenCalledWith('native_world', { request });
  });

  /** Empty initial seeds still use 1337; intermediate accumulators are never renormalized. */
  it('preserves initial zero/default and negative seed normalization', async () => {
    const zero = await new WorldGenerator(0).generate([0, 300]);
    const defaulted = await new WorldGenerator(1337).generate([0, 300]);
    expect(zero).toEqual(defaulted);
    await new WorldGenerator(-1).next(0);
    expect(transport.invoke.mock.lastCall?.[1].request.state.rngState).toBe(0xffffffff);
    expect(await new WorldGenerator(NaN).generate([0, 300])).toEqual(defaulted);
    expect(await new WorldGenerator(Number.MAX_SAFE_INTEGER + 1).generate([0, 300])).toEqual(defaulted);
    expect(await new WorldGenerator(1.5).next(0)).toEqual(await new WorldGenerator(1).next(0));
  });

  /** Queued singleton requests commit continuation in order, matching a single batch. */
  it('serializes concurrent calls and preserves batch/singleton equivalence', async () => {
    const distances = [0, 300, 800, 1500];
    const generator = new WorldGenerator(1);
    const singles = await Promise.all(distances.map(distance => generator.next(distance)));
    const batch = await new WorldGenerator(1).generate(distances);
    expect(singles).toEqual(batch);
    expect(transport.invoke.mock.calls[1][1].request.state.lastChunkId).toBe(singles[0].id);
  });

  /** Failed native calls retain the original token; there is no browser success fallback. */
  it('rejects native failure and retries with an unchanged continuation', async () => {
    const generator = new WorldGenerator(1337);
    transport.invoke.mockRejectedValueOnce('worker unavailable');
    await expect(generator.next(300)).rejects.toThrow('worker unavailable');
    const retried = await generator.next(300);
    expect(transport.invoke.mock.calls[0][1]).toEqual(transport.invoke.mock.calls[1][1]);
    expect(retried.id).toBe(planBrowserWorld(transport.invoke.mock.calls[0][1].request).chunks[0].id);
  });

  /** Invalid distances and oversized batches never enter either planner. */
  it.each([[], [-1], [NaN], [Infinity], [Number.MAX_SAFE_INTEGER + 1], Array(65).fill(0)])(
    'rejects invalid batch %j', async (...distances: number[]) => {
      await expect(new WorldGenerator(1).generate(distances)).rejects.toThrow('World batch requires');
      expect(transport.invoke).not.toHaveBeenCalled();
    }
  );

  /** A malformed native result must not consume the previous successful continuation. */
  it('rejects incomplete results and keeps the continuation retryable', async () => {
    const generator = new WorldGenerator(1);
    transport.invoke.mockResolvedValueOnce({ state: { rngState: 1, lastChunkId: '' }, chunks: [] });
    await expect(generator.next(0)).rejects.toThrow('invalid continuation or batch size');
    await generator.next(0);
    expect(transport.invoke.mock.calls[0][1]).toEqual(transport.invoke.mock.calls[1][1]);
  });

  /** Browser play uses its lazy planner and never invokes a native command. */
  it('retains standalone browser world generation', async () => {
    transport.isTauri.mockReturnValue(false);
    const result = await new WorldGenerator(1337).next(0);
    expect(result.id).toBe('warmup_stroll');
    expect(result.tiles).toHaveLength(15);
    expect(transport.invoke).not.toHaveBeenCalled();
  });

  /** Tile centers exactly on either gap edge are excluded from solid terrain. */
  it('retains inclusive terrain gaps and first-overlap precedence', () => {
    const chunk: ChunkDefinition = {
      ...CHUNK_CATALOG[0],
      obstacles: [
        { type: 'pit', xOffset: 96, width: 128 },
        { type: 'water_lagoon', xOffset: 96, width: 128 }
      ]
    };
    expect(planTerrain(chunk).slice(0, 4)).toEqual([
      { xOffset: 32, type: 'pit' }, { xOffset: 96, type: 'pit' },
      { xOffset: 160, type: 'pit' }, { xOffset: 224, type: 'ground' }
    ]);
  });

  /** Verify actual generated pit width against physics reach, even for vine recipes. */
  it('narrows oversized pits even when a nearby vine is present', () => {
    const wide: ChunkDefinition = {
      ...CHUNK_CATALOG[0],
      obstacles: [{ type: 'pit', xOffset: 480, width: 440 }]
    };
    expect(validateJumpGaps(wide)).toBe(false);
    const safe = normalizeWorldChunk(wide);
    expect(validateJumpGaps(safe)).toBe(true);
    expect(planTerrain(safe).filter(tile => tile.type === 'pit').length * 64).toBeLessThanOrEqual(MAX_JUMP_GAP);
    expect(wide.obstacles[0].width).toBe(440);
    const supported = { ...wide, obstacles: [...wide.obstacles, { type: 'swing_vine' as const, xOffset: 480 }] };
    expect(validateJumpGaps(normalizeWorldChunk(supported))).toBe(true);
    expect(normalizeWorldChunk(supported).obstacles[0].width).toBeLessThan(440);
    expect(MAX_JUMP_GAP).toBe(64);
    const gravity = MOVEMENT.worldGravity + MOVEMENT.playerGravity;
    expect(MOVEMENT.jumpVelocity ** 2 / (2 * gravity)).toBeGreaterThan(130);
    expect(2 * MOVEMENT.jumpVelocity * MOVEMENT.minimumRunSpeed / gravity)
      .toBeGreaterThan(MAX_JUMP_GAP + MOVEMENT.landingMargin);
  });

  /** Crocodiles are optional hazards/helpers, never exemptions from the conservative gap cap. */
  it('does not exempt oversized water even with a crocodile route', () => {
    const wide: ChunkDefinition = {
      ...CHUNK_CATALOG[0],
      obstacles: [{ type: 'water_lagoon', xOffset: 480, width: 256 }]
    };
    expect(validateJumpGaps({ ...wide, obstacles: [...wide.obstacles, { type: 'crocodile', xOffset: 900 }] })).toBe(false);
    expect(validateJumpGaps({ ...wide, obstacles: [...wide.obstacles, { type: 'crocodile', xOffset: 500 }] })).toBe(false);
    expect(validateJumpGaps({ ...wide, obstacles: [
      ...wide.obstacles, { type: 'crocodile', xOffset: 448 }, { type: 'crocodile', xOffset: 560 }
    ] })).toBe(false);
    for (const chunk of CHUNK_CATALOG) {
      expect(validateJumpGaps(chunk), chunk.id).toBe(true);
      const tiles = planTerrain(chunk);
      expect(tiles[0].type).toBe('ground');
      expect(tiles[tiles.length - 1].type).toBe('ground');
    }
  });

  /** Many independent seeds must remain in the same safe opening regardless of repeat guards. */
  it('keeps the opening safe and introduces pits and advanced hazards only at their boundaries', async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const generator = new WorldGenerator(seed);
      const opening = await generator.generate([0, 40, 80, 99, 100, 150, 250, 299]);
      expect(opening.slice(0, 4).every(chunk => chunk.obstacles.length === 0)).toBe(true);
      expect(opening.every(chunk => chunk.obstacles.every(obstacle => obstacle.type === 'log'))).toBe(true);
      const early = await generator.generate([300, 400, 599]);
      expect(early.every(chunk => chunk.minTier === 1)).toBe(true);
      expect(early.every(chunk => chunk.obstacles.every(o =>
        ['log', 'overhead_branch', 'pit'].includes(o.type)))).toBe(true);
    }
  });

  /** Test every rasterized tile run including vine recipes, not just a boolean validator. */
  it('limits every catalog void to one tile with solid ground at chunk boundaries', () => {
    for (const chunk of CHUNK_CATALOG) {
      let run = 0;
      for (const tile of planTerrain(chunk)) {
        run = tile.type === 'pit' || tile.type === 'water_lagoon' ? run + 64 : 0;
        expect(run, chunk.id).toBeLessThanOrEqual(64);
      }
    }
  });

  /** The introduction does not silently become harder through per-meter speed increases. */
  it('holds opening speed until 600m and then ramps gradually', () => {
    expect([0, 100, 299, 300, 599, 600].map(runSpeedAtDistance)).toEqual(Array(6).fill(290));
    expect(runSpeedAtDistance(700)).toBe(297);
    expect(runSpeedAtDistance(10000)).toBe(420);
  });

  /** Discrete 60-Hz integration checks the conservative unsupported span against actual tuning. */
  it('clears the maximum unsupported gap with one jump at minimum speed', () => {
    let y = 0;
    let x = 0;
    let velocity = -MOVEMENT.jumpVelocity;
    let peak = 0;
    const delta = 1 / 60;
    while (y <= 0) {
      velocity += (MOVEMENT.worldGravity + MOVEMENT.playerGravity) * delta;
      y += velocity * delta;
      x += MOVEMENT.minimumRunSpeed * delta;
      peak = Math.min(peak, y);
    }
    expect(-peak).toBeGreaterThan(120);
    expect(x).toBeGreaterThan(MAX_JUMP_GAP + MOVEMENT.landingMargin);
  });
});
