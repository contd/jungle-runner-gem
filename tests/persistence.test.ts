/**
 * Local profile and repository progression tests.
 * @remarks
 * - Defaults provide schema v1, zeroed records, all known goals, and only Harry unlocked.
 * - Recording a run accumulates counters and computes strict personal-best flags.
 * - Two runs totaling 55 coins cross Maya's lifetime 50-coin unlock threshold.
 * Vitest runs without a browser here: these checks exercise repository memory state,
 * not real IndexedDB transactions, LocalStorage durability, or reload recovery.
 * @module tests/persistence
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createDefaultProfile, INITIAL_ACHIEVEMENTS } from '../src/data/storage.ts';
import { LocalGameRepository } from '../src/data/repository.ts';

/** Check factory defaults and completed-run progression in a non-browser environment. */
describe('Local-First Persistence & Progression', () => {
  /** Fresh repository cache per test; the storage adapter remains a shared singleton. */
  let repo: LocalGameRepository;

  /** Isolate mutable cached progression so previous test runs cannot affect later expectations. */
  beforeEach(() => {
    repo = new LocalGameRepository();
  });

  /** Verify baseline schema, selected explorer, zero records, and initial catalog lock states. */
  it('initializes a default profile with correct default values and schema version', () => {
    /** Factory output inspected without loading browser storage. */
    const profile = createDefaultProfile();
    expect(profile.schemaVersion).toBe(1);
    expect(profile.selectedCharacterId).toBe('harry');
    expect(profile.stats.highScore).toBe(0);
    expect(profile.stats.totalRuns).toBe(0);
    expect(profile.achievements.length).toBe(INITIAL_ACHIEVEMENTS.length);
    expect(profile.unlockedSkins.find(s => s.id === 'harry')?.unlocked).toBe(true);
    expect(profile.unlockedSkins.find(s => s.id === 'maya')?.unlocked).toBe(false);
  });

  /** Check that a representative completed expedition contributes its metrics exactly once. */
  it('updates records and accumulates stats on completed run', async () => {
    /** Result includes both mutated totals and personal-best flags for an initially empty profile. */
    const outcome = await repo.recordRun({
      score: 1200,
      distanceMeters: 450,
      coinsCollected: 35,
      relicsCollected: 2,
      hazardsAvoided: 6,
      vinesSwung: 4,
      causeOfDeath: 'crocodile',
      characterId: 'harry',
      seed: 1337,
      mode: 'endless'
    });

    expect(outcome.newHighScore).toBe(true);
    expect(outcome.newLongestDistance).toBe(true);
    expect(outcome.profile.stats.totalRuns).toBe(1);
    expect(outcome.profile.stats.totalDistanceMeters).toBe(450);
    expect(outcome.profile.stats.totalCoins).toBe(35);
    expect(outcome.profile.stats.totalRelics).toBe(2);
    expect(outcome.profile.stats.mostVinesSwungInSingleRun).toBe(4);
  });

  /** Exercise a lifetime unlock spanning two runs rather than a single-run coin requirement. */
  it('unlocks Explorer Maya when 50 coins are collected', async () => {
    // Record first run with 30 coins
    await repo.recordRun({
      score: 500,
      distanceMeters: 200,
      coinsCollected: 30,
      relicsCollected: 0,
      hazardsAvoided: 2,
      vinesSwung: 1,
      causeOfDeath: 'pit',
      characterId: 'harry',
      seed: 100,
      mode: 'endless'
    });

    // Record second run with 25 coins -> total 55 coins
    /** The additional 25 coins raise lifetime pickups from 30 to 55. */
    const secondOutcome = await repo.recordRun({
      score: 600,
      distanceMeters: 220,
      coinsCollected: 25,
      relicsCollected: 0,
      hazardsAvoided: 3,
      vinesSwung: 1,
      causeOfDeath: 'log',
      characterId: 'harry',
      seed: 101,
      mode: 'endless'
    });

    /** Catalog entry and display-name notification must both reflect the same unlock. */
    const maya = secondOutcome.profile.unlockedSkins.find(s => s.id === 'maya');
    expect(maya?.unlocked).toBe(true);
    expect(secondOutcome.unlockedSkins).toContain('Explorer Maya');
  });
});
