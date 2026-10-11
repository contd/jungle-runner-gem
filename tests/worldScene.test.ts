/**
 * Async scene generation safety and lifecycle tests without a browser renderer.
 * Phaser infrastructure is stubbed, but the real scene request/control methods,
 * native continuation bridge and input subscriptions run unchanged.
 * @module tests/worldScene
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameScene } from '../src/game/scenes/GameScene.ts';
import { InputManager } from '../src/game/input/InputManager.ts';
import { DEFAULT_KEY_BINDINGS } from '../src/data/defaults.ts';
import { soundManager } from '../src/game/audio/SoundManager.ts';
import { planBrowserWorld } from '../src/game/systems/ProceduralGenerator.ts';
import type { WorldBatch, WorldRequest } from '../src/game/systems/worldTypes.ts';
import { MOVEMENT } from '../src/game/systems/movement.ts';
import { vineTip } from '../src/game/systems/vineGeometry.ts';
import { SWING_GRIP } from '../src/game/systems/characterAssets.ts';

/** Controlled IPC response; individual tests can leave a terrain request pending. */
const transport = vi.hoisted(() => ({ isTauri: vi.fn(() => true), invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => transport);
vi.mock('phaser', () => ({
  default: {
    /** Minimal scene infrastructure; sprites/rendering are deliberately not simulated. */
    Scene: class {
      /** Scene pause/input gate mock. */
      scene = { isActive: vi.fn(() => true) };
      /** Shutdown registration observed through the real create method. */
      events = { once: vi.fn() };
      /** World/group/collision registration substitutes. */
      physics = {
        world: { setBounds: vi.fn() },
        add: { staticGroup: vi.fn(), group: vi.fn(), collider: vi.fn(), overlap: vi.fn() }
      };
      /** Camera bounds substitute. */
      cameras = { main: { setBounds: vi.fn() } };
    },
    Math: { Distance: { Between: (x1: number, y1: number, x2: number, y2: number) =>
      Math.hypot(x2 - x1, y2 - y1) } },
    Scenes: { Events: { SHUTDOWN: 'shutdown', CREATE: 'create' } }
  }
}));

describe('Asynchronous world scene lifecycle', () => {
  /** Real scene with only sprite-construction helpers stubbed. */
  let scene: GameScene;
  /** Shared real input manager used to verify callback disposal. */
  let input: InputManager;
  /** Pause/loading/error notification observer. */
  const status = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    transport.invoke.mockReset();
    transport.invoke.mockImplementation(async (_command: string, { request }: { request: WorldRequest }) =>
      planBrowserWorld(request));
    vi.spyOn(soundManager, 'startMusic').mockImplementation(() => {});
    vi.spyOn(soundManager, 'stopMusic').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    input = new InputManager(DEFAULT_KEY_BINDINGS);
    scene = new GameScene();
    scene.init({
      inputManager: input, characterId: 'harry', gameMode: 'endless', seed: 1337,
      screenShakeEnabled: true, onStatsUpdate: vi.fn(), onGameOver: vi.fn(), onWorldStatus: status
    });
    scene['createParallaxBackgrounds'] = vi.fn();
    scene['createPlayer'] = vi.fn();
    scene['spawnSafeRunway'] = vi.fn();
    scene['spawnWorldChunk'] = vi.fn();
    scene.create();
    status.mockClear();
  });

  afterEach(() => { vi.restoreAllMocks(); });

  /** Startup reapplies external pause only after Phaser marks the scene running. */
  it('notifies the bridge after the create event rather than during construction', () => {
    expect(status).not.toHaveBeenCalled();
    const created = vi.mocked(scene.events.once).mock.calls.find(([event]) => event === 'create')?.[1];
    expect(created).toBeDefined();
    created?.();
    expect(status).toHaveBeenCalledExactlyOnceWith(null);
  });

  /** Pending calls are deduplicated; native failure offers the same distance/token on retry. */
  it('deduplicates pending requests and retries the failed distance unchanged', async () => {
    transport.invoke.mockRejectedValueOnce('worker failed');
    scene['distanceMeters'] = 299;
    scene['spawnNextWorldChunk']();
    scene['spawnNextWorldChunk']();
    await vi.waitFor(() => expect(status).toHaveBeenCalled());
    expect(transport.invoke).toHaveBeenCalledOnce();
    const failure = status.mock.lastCall?.[0];
    expect(failure.kind).toBe('error');
    scene['distanceMeters'] = 301;
    failure.retry();
    await vi.waitFor(() => expect(scene['spawnWorldChunk']).toHaveBeenCalledOnce());
    expect(transport.invoke.mock.calls[0][1]).toEqual(transport.invoke.mock.calls[1][1]);
    expect(status).toHaveBeenLastCalledWith(null);
  });

  /** No awaiting occurs in update; the scene signals pause 400 pixels before the terrain edge. */
  it('halts before the runner reaches unprepared terrain', () => {
    scene['worldRequestPending'] = true;
    scene['lastSpawnedX'] = 1200;
    Object.assign(scene, { player: { x: 800 } });
    scene.update(100, 16);
    expect(status).toHaveBeenCalledExactlyOnceWith({
      kind: 'loading', message: 'Preparing terrain...', retry: null
    });
    expect(scene['worldHalted']).toBe(true);
    scene.update(116, 16);
    expect(status).toHaveBeenCalledOnce();
  });

  /** Destroyed-scene responses cannot create objects, update the overlay or resume gameplay. */
  it('ignores late results after shutdown and disposes input subscriptions', async () => {
    let complete: ((batch: WorldBatch) => void) | undefined;
    let request: WorldRequest | undefined;
    transport.invoke.mockImplementation((_command: string, args: { request: WorldRequest }) => {
      request = args.request;
      return new Promise<WorldBatch>(resolve => { complete = resolve; });
    });
    const jump = vi.fn();
    scene['handleJumpAction'] = jump;
    input.triggerAction('jump', true);
    expect(jump).toHaveBeenCalledOnce();
    scene['spawnNextWorldChunk']();
    await vi.waitFor(() => expect(complete).toBeDefined());
    const shutdown = vi.mocked(scene.events.once).mock.calls.find(([event]) => event === 'shutdown')?.[1];
    expect(shutdown).toBeDefined();
    shutdown?.();
    input.triggerAction('jump', true);
    expect(jump).toHaveBeenCalledOnce();
    if (!request || !complete) throw new Error('Expected pending terrain request');
    complete(planBrowserWorld(request));
    await scene['generator']['pending'];
    await Promise.resolve();
    await Promise.resolve();
    expect(scene['spawnWorldChunk']).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  /** Rendering failure is not misreported as a retryable worker error after state committed. */
  it('surfaces rendering failures without retrying committed generation', async () => {
    vi.mocked(scene['spawnWorldChunk']).mockImplementation(() => { throw new Error('sprite failure'); });
    scene['spawnNextWorldChunk']();
    await vi.waitFor(() => expect(status).toHaveBeenCalled());
    expect(status.mock.lastCall?.[0]).toMatchObject({
      kind: 'error', retry: null, message: expect.stringContaining('Terrain rendering failed')
    });
    expect(transport.invoke).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalled();
  });

  /** Static asset poses stop running animation, while vine attachment uses the six-frame swing. */
  it('switches asset-pack jump, slide and swing poses without changing collision rules', () => {
    const player = {
      anims: { stop: vi.fn(), isPlaying: false, currentAnim: { key: 'run_harry' } },
      body: { blocked: { down: true }, touching: { down: true }, velocity: { y: 0 }, enable: true },
      setVelocityY: vi.fn(), setVelocity: vi.fn(), setTexture: vi.fn(), play: vi.fn(),
      setSize: vi.fn(), setOffset: vi.fn(), setOrigin: vi.fn(), setPosition: vi.fn(), setRotation: vi.fn()
    };
    Object.assign(scene, { player });
    vi.spyOn(soundManager, 'playJump').mockImplementation(() => {});
    vi.spyOn(soundManager, 'playSlide').mockImplementation(() => {});
    vi.spyOn(soundManager, 'playVineGrab').mockImplementation(() => {});
    scene['handleJumpAction']();
    expect(player.anims.stop).toHaveBeenCalledOnce();
    expect(player.setVelocityY).toHaveBeenCalledWith(-MOVEMENT.jumpVelocity);
    expect(player.setTexture).toHaveBeenCalledWith('player_harry_jump');
    scene['handleSlideAction']();
    expect(player.anims.stop).toHaveBeenCalledTimes(2);
    expect(player.setSize).toHaveBeenCalledWith(52, 24);
    expect(player.setTexture).toHaveBeenCalledWith('player_harry_slide');
    scene['attachToVine']({
      sprite: scene['activeVines'][0]?.sprite,
      anchorX: 0, anchorY: 120, length: 220, angle: 0, speed: 1.8, timeOffset: 0
    });
    expect(player.play).toHaveBeenCalledWith('swing_harry');
    expect(player.body.enable).toBe(false);
    scene['isSwingingOnVine'] = false;
    scene['onPlayerLandGround']();
    expect(player.play).toHaveBeenLastCalledWith('idle_harry');
    expect(player.setSize).toHaveBeenLastCalledWith(30, 54);
    expect(player.setOffset).toHaveBeenLastCalledWith(9, 10);
  });

  /** Separate presses allow one boost, not held repeats or a third jump; ground recharges it. */
  it('raises the jump and permits exactly one mid-air boost between landings', () => {
    const player = {
      body: { blocked: { down: true }, touching: { down: true }, velocity: { y: 0 } },
      anims: { stop: vi.fn(), isPlaying: true, currentAnim: { key: 'run_harry' } },
      setVelocityY: vi.fn(), setTexture: vi.fn(), play: vi.fn(), setSize: vi.fn(), setOffset: vi.fn()
    };
    Object.assign(scene, { player });
    vi.spyOn(soundManager, 'playJump').mockImplementation(() => {});
    input.triggerAction('jump', true);
    expect(player.setVelocityY).toHaveBeenLastCalledWith(-800);
    input.triggerAction('jump', true);
    expect(player.setVelocityY).toHaveBeenCalledOnce();
    input.triggerAction('jump', false);
    // Even stale grounded flags cannot grant repeated ground jumps before the next physics step.
    input.triggerAction('jump', true);
    expect(player.setVelocityY).toHaveBeenLastCalledWith(-720);
    input.triggerAction('jump', false);
    player.body.blocked.down = false;
    player.body.touching.down = false;
    input.triggerAction('jump', true);
    expect(player.setVelocityY).toHaveBeenCalledTimes(2);
    scene['onPlayerLandGround']();
    expect(scene['airBoostUsed']).toBe(true);
    player.body.blocked.down = true;
    player.body.velocity.y = -20;
    scene['onPlayerLandGround']();
    expect(scene['airBoostUsed']).toBe(true);
    player.body.velocity.y = 0;
    scene['onPlayerLandGround']();
    expect(scene['airBoostUsed']).toBe(false);
    input.triggerAction('jump', false);
    input.triggerAction('jump', true);
    input.triggerAction('jump', false);
    player.body.blocked.down = false;
    player.body.velocity.y = -100;
    input.triggerAction('jump', true);
    expect(player.setVelocityY.mock.calls.map(([velocity]) => velocity)).toEqual([-800, -720, -800, -820]);
  });

  /** Quicksand must rest over solid ground instead of becoming an unvalidated falling gap. */
  it('renders collidable ground beneath immovable quicksand', () => {
    const ground = { refreshBody: vi.fn() };
    const mud = {
      setImmovable: vi.fn(), setData: vi.fn(), refreshBody: vi.fn(),
      body: { setAllowGravity: vi.fn() }
    };
    const groundGroup = { create: vi.fn(() => ground) };
    const hazardsGroup = { create: vi.fn(() => mud) };
    Object.assign(scene, { groundGroup, hazardsGroup });
    GameScene.prototype['spawnWorldChunk'].call(scene, {
      id: 'mud_test', name: 'Mud test', width: 960, minTier: 2, biome: 'swamp',
      obstacles: [], collectibles: [], tiles: [{ xOffset: 32, type: 'quicksand' }]
    });
    expect(groundGroup.create).toHaveBeenCalledWith(32, 552, 'tile_ground');
    expect(ground.refreshBody).toHaveBeenCalledOnce();
    expect(mud.setImmovable).toHaveBeenCalledWith(true);
    expect(mud.body.setAllowGravity).toHaveBeenCalledWith(false);
  });

  /** Render transform and player hands must agree, and release cannot auto-reattach. */
  it.each([false, true])('detaches with a synchronized body and forward held=%s', forwardHeld => {
    const vine = {
      sprite: scene['activeVines'][0]?.sprite,
      anchorX: 500, anchorY: 120, length: 220, angle: 0.5, speed: 1.8, timeOffset: 0
    };
    const tip = vineTip(vine);
    expect(tip.x).toBeCloseTo(500 - Math.sin(0.5) * 220);
    expect(tip.y).toBeCloseTo(120 + Math.cos(0.5) * 220);
    const player = {
      x: tip.x, y: tip.y, displayHeight: 64,
      body: { enable: true, setAllowGravity: vi.fn(), reset: vi.fn() },
      anims: { stop: vi.fn() },
      setVelocity: vi.fn(), play: vi.fn(), setOrigin: vi.fn(), setPosition: vi.fn(),
      setTexture: vi.fn(), setSize: vi.fn(), setOffset: vi.fn(), setRotation: vi.fn(),
      getCenter: vi.fn(() => ({ x: tip.x - 11 * Math.cos(0.5) - 17 * Math.sin(0.5),
        y: tip.y - 11 * Math.sin(0.5) + 17 * Math.cos(0.5) }))
    };
    Object.assign(scene, { player });
    vi.spyOn(soundManager, 'playVineGrab').mockImplementation(() => {});
    vi.spyOn(soundManager, 'playVineSwing').mockImplementation(() => {});
    scene['attachToVine'](vine);
    expect(player.setOrigin).toHaveBeenCalledWith(SWING_GRIP.x / 48, SWING_GRIP.y / 64);
    expect(player.setRotation).toHaveBeenCalledWith(vine.angle);
    expect(player.setPosition).toHaveBeenCalledWith(tip.x, tip.y);
    input.triggerAction('forward', forwardHeld);
    input.triggerAction('jump', true);
    expect(scene['isSwingingOnVine']).toBe(false);
    expect(scene['attachedVine']).toBeNull();
    expect(player.body.enable).toBe(true);
    const center = player.getCenter();
    expect(player.body.reset).toHaveBeenCalledWith(center.x, center.y);
    expect(player.setRotation).toHaveBeenLastCalledWith(0);
    expect(player.setVelocity).toHaveBeenLastCalledWith(forwardHeld ? 290 : 0, -460);
    expect(player.setOrigin).toHaveBeenLastCalledWith(0.5, 0.5);
    expect(scene['vinesSwung']).toBe(1);
    expect(scene['checkForVineAttachment']()).toBe(false);
    scene['activeVines'] = [vine];
    scene['vineRegrabTimer'] = 0;
    expect(scene['checkForVineAttachment']()).toBe(false);
    player.x += 200;
    expect(scene['checkForVineAttachment']()).toBe(false);
    expect(scene['releasedVine']).toBeNull();
    player.x = tip.x - 11;
    player.y = tip.y + 17;
    expect(scene['checkForVineAttachment']()).toBe(true);
    expect(scene['isSwingingOnVine']).toBe(true);
    input.triggerAction('jump', true);
    expect(scene['vinesSwung']).toBe(1);
  });

  /** Each frame keeps both hand position and sprite rotation on the rendered pendulum. */
  it('updates the attached pose across positive and negative swing angles', () => {
    const vine = {
      sprite: { setRotation: vi.fn() },
      anchorX: 500, anchorY: 120, length: 230, angle: 0, speed: 1.8, timeOffset: 0
    };
    const player = { x: 500, y: 350, setPosition: vi.fn(), setRotation: vi.fn() };
    const group = { getChildren: () => [] };
    Object.assign(scene, {
      player, activeVines: [vine], attachedVine: vine, isSwingingOnVine: true,
      worldRequestPending: false, lastSpawnedX: 5000,
      hazardsGroup: group, coinsGroup: group, groundGroup: group,
      bgTempleTile: {}, bgCanopyTile: {}
    });
    Object.assign(scene.cameras.main, { scrollX: 0 });
    for (const time of [400, 2200, 3600]) {
      scene.update(time, 16);
      expect(player.setRotation).toHaveBeenLastCalledWith(vine.angle);
      expect(vine.sprite.setRotation).toHaveBeenLastCalledWith(vine.angle);
      const tip = vineTip(vine);
      expect(player.setPosition).toHaveBeenLastCalledWith(tip.x, tip.y);
    }
  });

  /** Right is a held gate in both grounded and airborne frames, not a toggle. */
  it('stands idle, runs only while forward is held, and stops again on release', () => {
    const player = {
      x: 500, y: 488,
      body: { blocked: { down: true }, touching: { down: true }, velocity: { y: 0 } },
      anims: { isPlaying: false, currentAnim: { key: 'run_harry' } },
      setVelocityX: vi.fn(), play: vi.fn(), setSize: vi.fn(), setOffset: vi.fn()
    };
    const group = { getChildren: () => [] };
    Object.assign(scene, {
      player, worldRequestPending: false, lastSpawnedX: 5000,
      hazardsGroup: group, coinsGroup: group, groundGroup: group,
      bgTempleTile: {}, bgCanopyTile: {}
    });
    Object.assign(scene.cameras.main, { scrollX: 0 });
    scene.update(0, 16);
    expect(player.setVelocityX).toHaveBeenLastCalledWith(0);
    expect(player.play).toHaveBeenLastCalledWith('idle_harry');
    input.triggerAction('forward', true);
    scene.update(16, 16);
    expect(player.setVelocityX).toHaveBeenLastCalledWith(290);
    expect(player.play).toHaveBeenLastCalledWith('run_harry');
    input.triggerAction('forward', false);
    scene.update(32, 16);
    expect(player.setVelocityX).toHaveBeenLastCalledWith(0);
    expect(player.play).toHaveBeenLastCalledWith('idle_harry');
    player.body.blocked.down = false;
    player.body.touching.down = false;
    player.body.velocity.y = -100;
    scene.update(48, 16);
    expect(player.setVelocityX).toHaveBeenLastCalledWith(0);
    expect(player.body.velocity.y).toBe(-100);
    input.triggerAction('forward', true);
    scene.update(64, 16);
    expect(player.setVelocityX).toHaveBeenLastCalledWith(290);
  });
});
