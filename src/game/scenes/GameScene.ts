/**
 * Jungle Run - Main GameScene
 * Complete endless runner with physics, parallax, vine swinging, crocodiles,
 * rolling boulders, collectibles, power-ups, and audio triggers.
 * Positions use virtual pixels, velocities pixels/second, and frame timers milliseconds.
 * @module game/scenes/GameScene
 */

import Phaser from 'phaser';
import { WorldGenerator } from '../systems/WorldGenerator.ts';
import { MOVEMENT, runSpeedAtDistance } from '../systems/movement.ts';
import { vineTip } from '../systems/vineGeometry.ts';
import { SWING_GRIP } from '../systems/characterAssets.ts';
import type { PlannedChunk, BiomeType, WorldStatus } from '../systems/worldTypes.ts';
import { soundManager } from '../audio/SoundManager.ts';
import { InputManager } from '../input/InputManager.ts';
import { GameMode } from '../../data/types.ts';

/** Run configuration passed by the React/Phaser bridge when starting the scene. */
export interface GameSceneInitData {
  /** Shared logical-action manager; scene listeners react to press notifications. */
  inputManager: InputManager;
  /** Boot-generated explorer texture/animation ID. */
  characterId: string;
  /** Life/fall rules for this expedition. */
  gameMode: GameMode;
  /** Chunk-selection seed; a falsy value currently triggers randomization in init. */
  seed: number;
  /** Whether impact/relic effects may shake the camera. */
  screenShakeEnabled: boolean;
  /** Per-frame callback updating the React telemetry overlay. */
  onStatsUpdate: (stats: GameHUDStats) => void;
  /** One-shot completion callback; persistence belongs to the React shell. */
  onGameOver: (result: GameOverData) => void;
  /** Terrain wait/failure gate owned by the React bridge; null clears only this pause reason. */
  onWorldStatus: (status: WorldStatus | null) => void;
}

/** Telemetry snapshot emitted each active update; not itself a persisted run record. */
export interface GameHUDStats {
  /** Floored current score, including distance and pickup bonuses. */
  score: number;
  /** Current floored distance, using 24 virtual pixels per game meter. */
  distanceMeters: number;
  /** Raw coin pickup count. */
  coins: number;
  /** Raw relic pickup count. */
  relics: number;
  /** Current score multiplier, capped at five. */
  multiplier: number;
  /** Remaining life counter; practice initializes to 999 and the HUD shows infinity. */
  lives: number;
  /** Whether one non-pit damage event can be absorbed. */
  shieldActive: boolean;
  /** Whether nearby coins are being attracted to the runner. */
  magnetActive: boolean;
  /** Biome of the latest spawned chunk, not necessarily the runner's current tile. */
  currentBiome: BiomeType;
}

/** Scene completion results, augmented with mode/character/identity by the repository. */
export interface GameOverData {
  /** Floored final score. */
  score: number;
  /** Floored final distance in game meters. */
  distanceMeters: number;
  /** Total coin pickups during this run. */
  coins: number;
  /** Total relic pickups during this run. */
  relics: number;
  /** Count of successful crocodile bounce events in the current scene implementation. */
  hazardsAvoided: number;
  /** Count of player-triggered vine releases. */
  vinesSwung: number;
  /** Final scene cause code, such as bottomless_pit or rolling_boulder. */
  causeOfDeath: string;
  /** Actual generation seed selected by the scene. */
  seed: number;
}

/** Scene-owned pendulum state; logical tip position is derived from anchor/length/angle. */
export interface ActiveVine {
  /** Rendered vine, rotated around its top origin. */
  sprite: Phaser.GameObjects.Sprite;
  /** Fixed horizontal anchor coordinate in world pixels. */
  anchorX: number;
  /** Fixed vertical anchor coordinate in world pixels. */
  anchorY: number;
  /** Logical tip distance from anchor in pixels. */
  length: number;
  /** Current rotation in radians, updated by the frame loop. */
  angle: number;
  /** Sinusoidal phase rate in radians/second. */
  speed: number;
  /** Random initial phase offset; independent of the chunk-selection seed. */
  timeOffset: number;
}

/**
 * Auto-running Arcade Physics scene with generated terrain and React telemetry.
 * The scene owns transient run state; boot owns textures, React owns screens,
 * and the repository owns completed-run progression. Static spacing checks in the
 * catalog do not fully simulate these physics/collision rules.
 */
export class GameScene extends Phaser.Scene {
  /** Shared input bridge supplied on scene initialization. */
  private inputManager!: InputManager;
  /** Texture/animation suffix for the selected explorer. */
  private characterId = 'harry';
  /** Active rule set governing life exhaustion and pit recovery. */
  private gameMode: GameMode = 'endless';
  /** Actual chunk-selection seed, randomized when init receives a falsy seed. */
  private runSeed = 1337;
  /** Per-run camera-shake gate copied from configuration. */
  private screenShakeEnabled = true;

  /** Consumer of active-frame HUD snapshots. */
  private onStatsUpdateCallback!: (stats: GameHUDStats) => void;
  /** Consumer of the first terminal run result. */
  private onGameOverCallback!: (result: GameOverData) => void;
  /** Pause/loading/retry UI consumer for asynchronous generation. */
  private onWorldStatusCallback!: (status: WorldStatus | null) => void;

  // World & Generation
  /** Per-run native/browser continuation owner, called only at chunk boundaries. */
  private generator!: WorldGenerator;
  /** At most one ahead-of-runner planning call may be in flight. */
  private worldRequestPending = false;
  /** Failed request distance retained unchanged for deterministic retry. */
  private worldRequestDistance: number | null = null;
  /** Terrain safety/error pause reason, independent of the user's pause overlay. */
  private worldHalted = false;
  /** Lifecycle token prevents abandoned responses from spawning into restarted scenes. */
  private worldEpoch = 0;
  /** Ground surface Y in the 600-pixel logical viewport. */
  private groundY = 520;
  /** Runner world X used for distance accounting, including the initial spawn offset. */
  private currentDistancePixels = 0;
  /** Monotonically recorded game meters, floor(world X / 24). */
  private distanceMeters = 0;
  /** Accumulated point total before HUD/result flooring. */
  private score = 0;
  /** Run coin pickup counter. */
  private coins = 0;
  /** Run relic pickup counter. */
  private relics = 0;
  /** Score factor increased by combo events, capped at five. */
  private multiplier = 1;
  /** Consecutive bonus events; reset on unshielded damage. */
  private comboStreak = 0;
  /** Currently increments on safe crocodile bounces, not every cleared hazard. */
  private hazardsAvoided = 0;
  /** Successful manual vine-release counter. */
  private vinesSwung = 0;
  /** Remaining lives, initialized to three or the practice sentinel 999. */
  private lives = 3;
  /** Terminal guard preventing further frame work and duplicate completion callbacks. */
  private isGameOver = false;
  /** Damage gate cleared by the flashing tween's completion callback. */
  private isInvulnerable = false;
  /** Recorded flash duration in milliseconds; currently not decremented by update. */
  private invulnerableTimer = 0;

  // Powerups
  /** One-hit protection; direct pit game-over bypasses this flag. */
  private shieldActive = false;
  /** Coin-attraction flag controlled by its countdown. */
  private magnetActive = false;
  /** Remaining attraction duration in milliseconds. */
  private magnetTimer = 0;

  // Runner Speed
  /** Starting auto-run speed in pixels/second. */
  private baseRunSpeed = 290;
  /** Frame-local speed including distance scaling or a quicksand collision adjustment. */
  private currentRunSpeed = 290;

  // Player Entity
  /** Character sprite with Arcade body, disabled while attached to a vine. */
  private player!: Phaser.Physics.Arcade.Sprite;
  /** Whether the shorter grounded slide collision box is active. */
  private isSliding = false;
  /** One airborne boost is allowed between real grounded landings. */
  private airBoostUsed = false;
  /** Prevent stale grounded flags from treating a rapid second press as another ground jump. */
  private jumpLaunched = false;
  /** Held-input gate makes keyboard repeat/device duplicate notifications non-jump events. */
  private jumpHeld = false;
  /** Remaining slide duration in milliseconds. */
  private slideTimer = 0;
  /** Whether player positioning is controlled by a pendulum instead of Arcade movement. */
  private isSwingingOnVine = false;
  /** Currently attached pendulum; null after release. */
  private attachedVine: ActiveVine | null = null;
  /** Short release lockout prevents auto-latch from undoing the Jump action. */
  private vineRegrabTimer = 0;
  /** Released vine stays excluded until the runner has moved outside attachment range. */
  private releasedVine: ActiveVine | null = null;
  /** Optional burst emitter for jump/slide dust, not continuously emitting. */
  private dustEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  // Background Parallax
  /** Midground texture scrolled at 35% of camera X. */
  private bgCanopyTile!: Phaser.GameObjects.TileSprite;
  /** Distant texture scrolled at 15% of camera X. */
  private bgTempleTile!: Phaser.GameObjects.TileSprite;
  /** Screen-fixed gradient beneath the tiled background layers. */
  private distantSkyGraphics!: Phaser.GameObjects.Graphics;

  // World Entity Groups
  /** Static collidable ground/plank bodies. */
  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;
  /** Stationary hazard bodies plus quicksand markers. */
  private hazardsGroup!: Phaser.Physics.Arcade.Group;
  /** Moving boulder bodies with separate ground colliders. */
  private bouldersGroup!: Phaser.Physics.Arcade.Group;
  /** Coin bodies supporting overlap collection and magnet movement. */
  private coinsGroup!: Phaser.Physics.Arcade.Group;
  /** Relic overlap bodies. */
  private relicsGroup!: Phaser.Physics.Arcade.Group;
  /** Shield/magnet overlap bodies carrying a type data field. */
  private powerupsGroup!: Phaser.Physics.Arcade.Group;
  /** Pendulums created from generated chunks; not part of a physics group. */
  private activeVines: ActiveVine[] = [];

  // Procedural Spawning tracking
  /** Right edge of generated terrain in world pixels. */
  private lastSpawnedX = 0;
  /** Biome copied from the last generated recipe for HUD reporting. */
  private currentBiome: BiomeType = 'canopy';

  /** Register the stable scene key used by boot and the React bridge. */
  constructor() {
    super({ key: 'GameScene' });
  }

  /**
   * Accept run options and reset counters/power-ups/spawning bookkeeping.
   * Falsy seeds randomize; practice uses a large life sentinel plus pit teleportation.
   * The bridge must supply its input manager before create installs action listeners.
   */
  init(data: GameSceneInitData) {
    this.inputManager = data.inputManager;
    this.characterId = data.characterId || 'harry';
    this.gameMode = data.gameMode || 'endless';
    this.runSeed = data.seed || Math.floor(Math.random() * 1000000);
    this.screenShakeEnabled = data.screenShakeEnabled !== false;
    this.onStatsUpdateCallback = data.onStatsUpdate || (() => {});
    this.onGameOverCallback = data.onGameOver || (() => {});
    this.onWorldStatusCallback = data.onWorldStatus;

    this.isGameOver = false;
    this.currentDistancePixels = 0;
    this.distanceMeters = 0;
    this.score = 0;
    this.coins = 0;
    this.relics = 0;
    this.multiplier = 1;
    this.comboStreak = 0;
    this.hazardsAvoided = 0;
    this.vinesSwung = 0;
    this.lives = this.gameMode === 'practice' ? 999 : 3;
    this.shieldActive = false;
    this.magnetActive = false;
    this.activeVines = [];
    this.lastSpawnedX = 0;
    this.currentRunSpeed = this.baseRunSpeed;
    this.worldRequestPending = false;
    this.worldRequestDistance = null;
    this.worldHalted = false;
    this.worldEpoch++;
    this.airBoostUsed = false;
    this.jumpLaunched = false;
    this.jumpHeld = this.inputManager.isActionActive('jump');
    this.isSwingingOnVine = false;
    this.attachedVine = null;
    this.releasedVine = null;
    this.vineRegrabTimer = 0;
  }

  /** Build backgrounds/groups/runway/player, register collision/input hooks, and start music. */
  create() {
    this.generator = new WorldGenerator(this.runSeed);

    // Setup Camera and World Bounds
    const viewWidth = 960;
    const viewHeight = 600;
    this.cameras.main.setBounds(0, 0, Number.MAX_SAFE_INTEGER, viewHeight);
    this.physics.world.setBounds(0, 0, Number.MAX_SAFE_INTEGER, viewHeight + 100);

    // Parallax Backgrounds
    this.createParallaxBackgrounds(viewWidth, viewHeight);

    // Entity Groups
    this.groundGroup = this.physics.add.staticGroup();
    this.hazardsGroup = this.physics.add.group();
    this.bouldersGroup = this.physics.add.group();
    this.coinsGroup = this.physics.add.group();
    this.relicsGroup = this.physics.add.group();
    this.powerupsGroup = this.physics.add.group();

    // Spawn Initial Safe Runway
    this.spawnSafeRunway(1200);

    // Create Player
    this.createPlayer();

    // Collisions
    this.physics.add.collider(this.player, this.groundGroup, this.onPlayerLandGround, undefined, this);
    this.physics.add.overlap(this.player, this.coinsGroup, this.onCollectCoin as any, undefined, this);
    this.physics.add.overlap(this.player, this.relicsGroup, this.onCollectRelic as any, undefined, this);
    this.physics.add.overlap(this.player, this.powerupsGroup, this.onCollectPowerup as any, undefined, this);
    this.physics.add.overlap(this.player, this.hazardsGroup, this.onHitHazard as any, undefined, this);
    this.physics.add.overlap(this.player, this.bouldersGroup, this.onHitBoulder as any, undefined, this);

    // Input hooks
    const unsubscribe = [
      this.inputManager.onAction('jump', (pressed) => {
        const freshPress = pressed && !this.jumpHeld;
        this.jumpHeld = pressed;
        if (freshPress && this.scene.isActive()) this.handleJumpAction();
      }),
      this.inputManager.onAction('slide', (pressed) => {
        if (pressed && this.scene.isActive()) this.handleSlideAction();
      }),
      this.inputManager.onAction('interact', (pressed) => {
        if (pressed && this.scene.isActive()) this.handleInteractAction();
      })
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.worldEpoch++;
      unsubscribe.forEach(remove => remove());
      soundManager.stopMusic();
    });

    // Start Procedural Music
    soundManager.startMusic();
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.onWorldStatusCallback(null));
  }

  /** Create a screen-fixed gradient and two camera-independent tiled background layers. */
  private createParallaxBackgrounds(w: number, h: number) {
    // Sky gradient
    this.distantSkyGraphics = this.add.graphics();
    this.distantSkyGraphics.setScrollFactor(0);
    this.distantSkyGraphics.fillGradientStyle(0x0d2b1d, 0x0d2b1d, 0x1f4e38, 0x1f4e38, 1);
    this.distantSkyGraphics.fillRect(0, 0, w, h);

    // Deep temple ruins layer (slow parallax 0.15)
    this.bgTempleTile = this.add.tileSprite(0, 40, w * 2, 450, 'bg_temple');
    this.bgTempleTile.setOrigin(0, 0);
    this.bgTempleTile.setScrollFactor(0);
    this.bgTempleTile.setAlpha(0.35);

    // Midground rainforest canopy (parallax 0.35)
    this.bgCanopyTile = this.add.tileSprite(0, 80, w * 2, 480, 'bg_canopy');
    this.bgCanopyTile.setOrigin(0, 0);
    this.bgCanopyTile.setScrollFactor(0);
    this.bgCanopyTile.setAlpha(0.65);
  }

  /**
   * Spawn the runner with a 30-by-54 pixel body, follow-camera offset, and dust bursts.
   * Player-specific gravity is added to the world gravity configured by the bridge.
   */
  private createPlayer() {
    this.player = this.physics.add.sprite(180, this.groundY - 60, `player_${this.characterId}_run`);
    this.player.setCollideWorldBounds(false);
    this.player.setSize(30, 54);
    this.player.setOffset(9, 10);
    this.player.setGravityY(MOVEMENT.playerGravity);

    this.player.play(`${this.inputManager.isActionActive('forward') ? 'run' : 'idle'}_${this.characterId}`);

    // Camera follow player horizontally
    this.cameras.main.startFollow(this.player, true, 0.1, 0.05, -240, 60);

    // Dust particles
    const dustParticles = this.add.particles(0, 0, 'part_dust', {
      lifespan: 300,
      speed: { min: 20, max: 60 },
      angle: { min: 140, max: 220 },
      scale: { start: 0.8, end: 0.1 },
      alpha: { start: 0.6, end: 0 },
      emitting: false
    });
    this.dustEmitter = dustParticles;
  }

  /** Fill the initial hazard-free runway with 64-pixel tiles and advance the terrain edge. */
  private spawnSafeRunway(width: number) {
    const tileW = 64;
    for (let x = 0; x < width; x += tileW) {
      const tile = this.groundGroup.create(x + tileW / 2, this.groundY + 32, 'tile_ground') as Phaser.Physics.Arcade.Sprite;
      tile.refreshBody();
    }
    this.lastSpawnedX = width;
  }

  /**
   * Request ahead-of-runner terrain at the current distance, deduplicating frame calls.
   * Retrying preserves the failed distance/continuation. Abandoned scene results
   * cannot spawn objects or resume a newer run.
   */
  private spawnNextWorldChunk() {
    if (this.worldRequestPending || this.isGameOver) return;
    this.worldRequestPending = true;
    this.worldRequestDistance ??= this.distanceMeters;
    const epoch = this.worldEpoch;
    if (this.worldHalted) {
      this.onWorldStatusCallback({ kind: 'loading', message: 'Preparing terrain...', retry: null });
    }
    this.generator.next(this.worldRequestDistance).then(chunk => {
      if (epoch !== this.worldEpoch || this.isGameOver) return;
      try {
        this.spawnWorldChunk(chunk);
      } catch (error) {
        this.worldRequestPending = false;
        this.worldHalted = true;
        console.error('World rendering failed after successful generation:', error);
        this.onWorldStatusCallback({
          kind: 'error', message: `Terrain rendering failed. Return to the menu and restart this expedition. ${String(error)}`,
          retry: null
        });
        return;
      }
      this.worldRequestPending = false;
      this.worldRequestDistance = null;
      if (this.worldHalted) {
        this.worldHalted = false;
        this.onWorldStatusCallback(null);
      }
    }, error => {
      if (epoch !== this.worldEpoch || this.isGameOver) return;
      this.worldRequestPending = false;
      this.worldHalted = true;
      console.error('World generation failed:', error);
      this.onWorldStatusCallback({
        kind: 'error',
        message: String(error),
        retry: () => {
          if (epoch === this.worldEpoch && !this.isGameOver) this.spawnNextWorldChunk();
        }
      });
    });
  }

  /** Instantiate native-planned terrain plus renderer-owned bodies, pendulums and pickups. */
  private spawnWorldChunk(chunk: PlannedChunk) {
    this.currentBiome = chunk.biome;
    const startX = this.lastSpawnedX;
    const chunkW = chunk.width;
    const tileW = 64;

    for (const terrain of chunk.tiles) {
      const midX = startX + terrain.xOffset;
      if (terrain.type !== 'ground') {
        if (terrain.type === 'water_lagoon') {
          this.add.tileSprite(midX, this.groundY + 32, tileW, 64, 'tile_water');
        } else if (terrain.type === 'quicksand') {
          const ground = this.groundGroup.create(midX, this.groundY + 32, 'tile_ground') as Phaser.Physics.Arcade.Sprite;
          ground.refreshBody();
          const quicksand = this.hazardsGroup.create(midX, this.groundY + 32, 'tile_quicksand') as Phaser.Physics.Arcade.Sprite;
          quicksand.setImmovable(true);
          (quicksand.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
          quicksand.setData('hazardType', 'quicksand');
          quicksand.refreshBody();
        }
        // Pit leaves bottomless void
      } else {
        const tile = this.groundGroup.create(midX, this.groundY + 32, 'tile_ground') as Phaser.Physics.Arcade.Sprite;
        tile.refreshBody();
      }
    }

    // Spawn Obstacles
    chunk.obstacles.forEach(obs => {
      const obsX = startX + obs.xOffset;

      if (obs.type === 'log') {
        const log = this.hazardsGroup.create(obsX, this.groundY - 16, 'hazard_log') as Phaser.Physics.Arcade.Sprite;
        log.setSize(48, 28);
        log.setOffset(4, 4);
        log.setData('hazardType', 'log');
        log.setImmovable(true);
        (log.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      } else if (obs.type === 'overhead_branch') {
        const branchY = this.groundY - 70;
        const branch = this.hazardsGroup.create(obsX, branchY, 'hazard_branch') as Phaser.Physics.Arcade.Sprite;
        branch.setSize(130, 24);
        branch.setOffset(5, 6);
        branch.setData('hazardType', 'branch');
        branch.setImmovable(true);
        (branch.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      } else if (obs.type === 'crocodile') {
        const croc = this.hazardsGroup.create(obsX, this.groundY - 8, 'hazard_crocodile') as Phaser.Physics.Arcade.Sprite;
        croc.setSize(64, 26);
        croc.setOffset(4, 6);
        croc.setData('hazardType', 'crocodile');
        croc.setData('mouthOpen', false);
        croc.setImmovable(true);
        (croc.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

        // Periodic snapping animation
        this.tweens.add({
          targets: croc,
          y: this.groundY - 14,
          duration: 1200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      } else if (obs.type === 'rolling_boulder') {
        const boulder = this.bouldersGroup.create(obsX, this.groundY - 32, 'hazard_boulder') as Phaser.Physics.Arcade.Sprite;
        boulder.setCircle(28, 4, 4);
        boulder.setData('hazardType', 'boulder');
        boulder.setVelocityX(obs.speed || -180);
        boulder.setBounce(0.2);
        boulder.setAngularVelocity(-240);
        this.physics.add.collider(boulder, this.groundGroup);
      } else if (obs.type === 'spike_trap') {
        const spikes = this.hazardsGroup.create(obsX, this.groundY - 15, 'hazard_spikes') as Phaser.Physics.Arcade.Sprite;
        spikes.setSize(54, 24);
        spikes.setOffset(3, 6);
        spikes.setData('hazardType', 'spikes');
        spikes.setImmovable(true);
        (spikes.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      } else if (obs.type === 'snake') {
        const snake = this.hazardsGroup.create(obsX, this.groundY - 12, 'hazard_snake') as Phaser.Physics.Arcade.Sprite;
        snake.setSize(36, 20);
        snake.setOffset(2, 4);
        snake.setData('hazardType', 'snake');
        snake.setImmovable(true);
        (snake.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      } else if (obs.type === 'collapsing_bridge') {
        const plank = this.groundGroup.create(obsX, this.groundY + 10, 'hazard_plank') as Phaser.Physics.Arcade.Sprite;
        plank.setSize(64, 16);
        plank.setData('collapsible', true);
        plank.refreshBody();
      } else if (obs.type === 'swing_vine') {
        const anchorX = obsX;
        const anchorY = 120;
        const length = obs.meta?.length || 230;

        const vineSprite = this.add.sprite(anchorX, anchorY, 'obj_vine');
        vineSprite.setOrigin(0.5, 0);
        vineSprite.setDisplaySize(16, length);

        this.activeVines.push({
          sprite: vineSprite,
          anchorX,
          anchorY,
          length,
          angle: 0,
          speed: 1.8,
          timeOffset: Math.random() * Math.PI
        });
      }
    });

    // Spawn Collectibles
    chunk.collectibles.forEach(col => {
      const colX = startX + col.xOffset;
      const colY = this.groundY + col.yOffset;

      if (col.type === 'coin') {
        const coin = this.coinsGroup.create(colX, colY, 'item_coin') as Phaser.Physics.Arcade.Sprite;
        coin.setCircle(10, 2, 2);
        (coin.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        this.tweens.add({
          targets: coin,
          y: colY - 6,
          duration: 600,
          yoyo: true,
          repeat: -1
        });
      } else if (col.type === 'relic') {
        const relic = this.relicsGroup.create(colX, colY, 'item_relic') as Phaser.Physics.Arcade.Sprite;
        relic.setSize(28, 28);
        (relic.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        this.tweens.add({
          targets: relic,
          scale: 1.15,
          duration: 500,
          yoyo: true,
          repeat: -1
        });
      } else if (col.type === 'powerup_shield' || col.type === 'powerup_magnet') {
        const tex = col.type === 'powerup_shield' ? 'powerup_shield' : 'powerup_magnet';
        const pwr = this.powerupsGroup.create(colX, colY, tex) as Phaser.Physics.Arcade.Sprite;
        pwr.setData('type', col.type);
        pwr.setSize(28, 28);
        (pwr.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        this.tweens.add({
          targets: pwr,
          y: colY - 8,
          duration: 500,
          yoyo: true,
          repeat: -1
        });
      }
    });

    this.lastSpawnedX += chunkW;
  }

  // --- Controls & Mechanics ---

  /**
   * Jump higher from ground or apply one upward boost on a distinct airborne press.
   * Vine release keeps its bonus; neither vines nor crocodiles recharge an already
   * spent boost. Only a real grounded landing restores it.
   */
  private handleJumpAction() {
    if (this.isGameOver) return;

    if (this.isSwingingOnVine) {
      // Launch off vine with forward momentum
      this.releasedVine = this.attachedVine;
      this.vineRegrabTimer = 400;
      this.isSwingingOnVine = false;
      this.attachedVine = null;
      const center = this.player.getCenter();
      this.player.anims.stop();
      this.player.setTexture(`player_${this.characterId}_jump`);
      this.player.setOrigin(0.5, 0.5);
      this.player.setRotation(0);
      this.player.setSize(30, 54);
      this.player.setOffset(9, 10);
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.enable = true;
      body.setAllowGravity(true);
      body.reset(center.x, center.y);
      this.player.setVelocity(this.inputManager.isActionActive('forward') ? this.currentRunSpeed : 0, -460);
      this.jumpLaunched = true;
      soundManager.playVineSwing();
      this.vinesSwung++;
      this.score += 250 * this.multiplier;
      this.triggerCombo();
      return;
    }

    const onFloor = this.player.body?.blocked.down || this.player.body?.touching.down;
    if (this.isSliding) return;
    if (onFloor && !this.jumpLaunched) {
      this.jumpLaunched = true;
      this.player.setVelocityY(-MOVEMENT.jumpVelocity);
      this.player.anims.stop();
      this.player.setTexture(`player_${this.characterId}_jump`);
      soundManager.playJump();

      if (this.dustEmitter) {
        this.dustEmitter.emitParticleAt(this.player.x, this.player.y + 24, 6);
      }
    } else if (!this.airBoostUsed) {
      this.airBoostUsed = true;
      this.jumpLaunched = true;
      this.player.setVelocityY(Math.min(0, this.player.body!.velocity.y) - MOVEMENT.boostVelocity);
      this.player.anims.stop();
      this.player.setTexture(`player_${this.characterId}_jump`);
      soundManager.playJump();
    }
  }

  /** Start a 440 ms grounded slide with a 52-by-24 pixel collision box. */
  private handleSlideAction() {
    if (this.isGameOver || this.isSwingingOnVine) return;
    const onFloor = this.player.body?.blocked.down || this.player.body?.touching.down;

    if (onFloor && !this.isSliding) {
      this.isSliding = true;
      this.slideTimer = 440; // ms
      this.player.anims.stop();
      this.player.setTexture(`player_${this.characterId}_slide`);
      this.player.setSize(52, 24);
      this.player.setOffset(4, 10);
      soundManager.playSlide();

      if (this.dustEmitter) {
        this.dustEmitter.emitParticleAt(this.player.x - 10, this.player.y + 14, 8);
      }
    }
  }

  /** Attempt a nearby vine latch unless already attached or the run is terminal. */
  private handleInteractAction() {
    // If near vine and not yet swinging, latch onto vine
    if (this.isGameOver || this.isSwingingOnVine) return;
    this.checkForVineAttachment();
  }

  /** Attach to the first logical vine tip within 60 pixels; also called automatically per frame. */
  private checkForVineAttachment(): boolean {
    if (this.vineRegrabTimer > 0 || this.isGameOver || this.isSwingingOnVine) return false;
    const px = this.player.x + SWING_GRIP.x - 24;
    const py = this.player.y + SWING_GRIP.y - 32;

    for (const vine of this.activeVines) {
      const tip = vineTip(vine);

      const dist = Phaser.Math.Distance.Between(px, py, tip.x, tip.y);
      if (vine === this.releasedVine) {
        if (dist > 100) this.releasedVine = null;
        continue;
      }
      if (dist < 60) {
        this.attachToVine(vine);
        return true;
      }
    }
    return false;
  }

  /** Freeze Arcade motion/body and switch to the swing pose for pendulum positioning. */
  private attachToVine(vine: ActiveVine) {
    this.isSwingingOnVine = true;
    this.attachedVine = vine;
    this.isSliding = false;
    this.player.setVelocity(0, 0);
    this.player.body!.enable = false;
    this.player.play(`swing_${this.characterId}`);
    this.player.setOrigin(SWING_GRIP.x / 48, SWING_GRIP.y / 64);
    this.player.setRotation(vine.angle);
    const tip = vineTip(vine);
    this.player.setPosition(tip.x, tip.y);
    soundManager.playVineGrab();
  }

  /** Restore the held-direction run/idle pose and standing body on a grounded landing. */
  private onPlayerLandGround() {
    if (this.isGameOver || this.isSwingingOnVine) return;
    const body = this.player.body;
    if (!body || !(body.blocked.down || body.touching.down) || body.velocity.y < 0) return;
    this.airBoostUsed = false;
    this.jumpLaunched = false;

    const animation = `${this.inputManager.isActionActive('forward') ? 'run' : 'idle'}_${this.characterId}`;
    if (!this.isSliding && (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== animation)) {
      this.player.play(animation);
      this.player.setSize(30, 54);
      this.player.setOffset(9, 10);
    }
  }

  // --- Collisions & Hazards ---

  /**
   * Handle static-hazard overlap: crocodile descent bounce, quicksand slowdown, or damage.
   * Crocodile bounce currently tests downward velocity/relative height, not mouthOpen.
   * Damage is suppressed during invulnerability and after a terminal result.
   */
  private onHitHazard(_player: any, hazard: any) {
    if (this.isGameOver || this.isInvulnerable) return;

    const hazardType = hazard.getData('hazardType');

    // Crocodile Closed Mouth Bounce Mechanic
    if (hazardType === 'crocodile') {
      const isFalling = this.player.body?.velocity.y! > 0;
      const hitFromAbove = this.player.y < hazard.y - 10;
      if (isFalling && hitFromAbove) {
        // Player bounced safely on top of crocodile!
        this.player.setVelocityY(-MOVEMENT.crocodileBounceVelocity);
        soundManager.playJump();
        this.score += 200 * this.multiplier;
        this.triggerCombo();
        this.hazardsAvoided++;
        return;
      }
    }

    // Quicksand slowdown mechanic
    if (hazardType === 'quicksand') {
      this.currentRunSpeed = this.baseRunSpeed * 0.55;
      return;
    }

    this.takeDamage(hazardType || 'hazard');
  }

  /** Route boulder overlap to damage with its distinct rolling_boulder result code. */
  private onHitBoulder(_player: any, _boulder: any) {
    if (this.isGameOver || this.isInvulnerable) return;
    this.takeDamage('rolling_boulder');
  }

  /**
   * Consume a shield or life and trigger impact feedback plus temporary invulnerability.
   * Unshielded damage resets the combo; life exhaustion ends non-practice runs.
   * Pit termination is handled separately and does not pass through this method.
   */
  private takeDamage(cause: string) {
    if (this.shieldActive) {
      this.shieldActive = false;
      this.flashInvulnerable(1500);
      soundManager.playHit();
      if (this.screenShakeEnabled) {
        this.cameras.main.shake(180, 0.015);
      }
      return;
    }

    this.lives--;
    this.comboStreak = 0;
    this.multiplier = 1;
    soundManager.playHit();

    if (this.screenShakeEnabled) {
      this.cameras.main.shake(250, 0.025);
    }

    if (this.lives <= 0 && this.gameMode !== 'practice') {
      this.triggerGameOver(cause);
    } else {
      this.flashInvulnerable(1600);
      this.player.setVelocityY(-350);
    }
  }

  /** Gate damage while a repeated alpha tween runs; completion restores opacity and vulnerability. */
  private flashInvulnerable(durationMs: number) {
    this.isInvulnerable = true;
    this.invulnerableTimer = durationMs;

    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: Math.floor(durationMs / 200),
      onComplete: () => {
        this.player.setAlpha(1);
        this.isInvulnerable = false;
      }
    });
  }

  /** Destroy the coin, add 100 points at the current multiplier, then advance combo state. */
  private onCollectCoin(_player: any, coin: any) {
    coin.destroy();
    this.coins++;
    this.score += 100 * this.multiplier;
    soundManager.playCoin();
    this.triggerCombo();
  }

  /** Destroy the relic, add 500 multiplied points, advance combo, and optionally shake. */
  private onCollectRelic(_player: any, relic: any) {
    relic.destroy();
    this.relics++;
    this.score += 500 * this.multiplier;
    soundManager.playRelic();
    this.triggerCombo();

    if (this.screenShakeEnabled) {
      this.cameras.main.shake(120, 0.008);
    }
  }

  /** Consume a pickup to activate one-hit shielding or reset a nine-second coin magnet. */
  private onCollectPowerup(_player: any, powerup: any) {
    const type = powerup.getData('type');
    powerup.destroy();
    soundManager.playPowerup();

    if (type === 'powerup_shield') {
      this.shieldActive = true;
    } else if (type === 'powerup_magnet') {
      this.magnetActive = true;
      this.magnetTimer = 9000; // 9 seconds
    }
  }

  /**
   * Increment the streak and update floor(streak / 4) + 1, capped at five.
   * The existing guard begins updates at streak five, so the first increase is not at four.
   */
  private triggerCombo() {
    this.comboStreak++;
    if (this.comboStreak >= 5 && this.multiplier < 5) {
      this.multiplier = Math.min(5, Math.floor(this.comboStreak / 4) + 1);
    }
  }

  /** Stop runner/music scheduling and emit the final floored result exactly once. */
  private triggerGameOver(cause: string) {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.player.setVelocity(0, 0);
    this.player.setTint(0xef4444);
    soundManager.stopMusic();
    soundManager.playGameOver();

    this.onGameOverCallback({
      score: Math.floor(this.score),
      distanceMeters: Math.floor(this.distanceMeters),
      coins: this.coins,
      relics: this.relics,
      hazardsAvoided: this.hazardsAvoided,
      vinesSwung: this.vinesSwung,
      causeOfDeath: cause,
      seed: this.runSeed
    });
  }

  // --- Main Update Loop ---

  /**
   * Advance movement, timers, pendulums, distance score, spawning, cleanup, and telemetry.
   * @param time - Phaser elapsed game-clock time in milliseconds, used for vine phase.
   * @param delta - Frame duration in milliseconds, used for slide/magnet countdowns.
   * @remarks Distance awards two multiplied points per new game meter. Speed grows
   * after the 600-meter introduction by 0.07 pixels/second per meter, capped at a 130 increase. Only hazard, coin,
   * and ground groups are currently culled behind the camera; other entities remain.
   */
  update(time: number, delta: number) {
    if (this.isGameOver) return;
    if (this.worldRequestPending && !this.worldHalted && this.player.x + 400 >= this.lastSpawnedX) {
      this.worldHalted = true;
      this.onWorldStatusCallback({ kind: 'loading', message: 'Preparing terrain...', retry: null });
      return;
    }
    if (this.worldHalted) return;
    this.vineRegrabTimer = Math.max(0, this.vineRegrabTimer - delta);

    const deltaSec = delta / 1000;

    // Difficulty Speed Scaling
    this.currentRunSpeed = runSpeedAtDistance(this.distanceMeters);

    // Active Sliding State
    if (this.isSliding) {
      this.slideTimer -= delta;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
        this.player.setSize(30, 54);
        this.player.setOffset(9, 10);
        this.player.play(`${this.inputManager.isActionActive('forward') ? 'run' : 'idle'}_${this.characterId}`);
      }
    }

    // Vine Pendulum Physics
    this.activeVines.forEach(vine => {
      const swingAngle = Math.sin((time / 1000) * vine.speed + vine.timeOffset) * 0.75;
      vine.angle = swingAngle;
      vine.sprite.setRotation(swingAngle);
    });

    if (this.isSwingingOnVine && this.attachedVine) {
      const vine = this.attachedVine;
      const tip = vineTip(vine);
      this.player.setPosition(tip.x, tip.y);
      this.player.setRotation(vine.angle);
    } else {
      // Normal Runner Forward Movement
      this.player.setVelocityX(this.inputManager.isActionActive('forward') ? this.currentRunSpeed : 0);
      this.onPlayerLandGround();
      if (!this.isSliding && this.player.body!.velocity.y > 0
        && !this.player.body!.blocked.down && !this.player.body!.touching.down) {
        this.player.play(`air_${this.characterId}`, true);
      }
      this.checkForVineAttachment();
    }

    // Bottomless Pit Fall Detection
    if (this.player.y > this.groundY + 80) {
      if (this.gameMode === 'practice') {
        // Practice mode rewind / teleport back to runway
        this.player.setPosition(this.player.x, this.groundY - 80);
        this.player.setVelocityY(-400);
      } else {
        this.triggerGameOver('bottomless_pit');
        return;
      }
    }

    // Magnet Powerup coin attraction
    if (this.magnetActive) {
      this.magnetTimer -= delta;
      if (this.magnetTimer <= 0) {
        this.magnetActive = false;
      }

      this.coinsGroup.getChildren().forEach((c: any) => {
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y);
        if (dist < 260) {
          this.physics.moveToObject(c, this.player, 420);
        }
      });
    }

    // Distance & Score Accumulation
    this.currentDistancePixels = this.player.x;
    const newDistanceMeters = Math.floor(this.currentDistancePixels / 24);
    if (newDistanceMeters > this.distanceMeters) {
      const diff = newDistanceMeters - this.distanceMeters;
      this.score += diff * 2 * this.multiplier;
      this.distanceMeters = newDistanceMeters;
    }

    // Procedural Generation: Spawn chunk when camera approaches lastSpawnedX
    if (this.cameras.main.scrollX + 1600 > this.lastSpawnedX) {
      this.spawnNextWorldChunk();
    }

    // Clean up off-screen distant entities to maintain high performance
    const cleanupThreshold = this.cameras.main.scrollX - 600;
    this.hazardsGroup.getChildren().forEach((h: any) => {
      if (h.x < cleanupThreshold) h.destroy();
    });
    this.coinsGroup.getChildren().forEach((c: any) => {
      if (c.x < cleanupThreshold) c.destroy();
    });
    this.groundGroup.getChildren().forEach((g: any) => {
      if (g.x < cleanupThreshold) g.destroy();
    });

    // Update Parallax Scroll
    this.bgTempleTile.tilePositionX = this.cameras.main.scrollX * 0.15;
    this.bgCanopyTile.tilePositionX = this.cameras.main.scrollX * 0.35;

    // Send HUD telemetry
    this.onStatsUpdateCallback({
      score: Math.floor(this.score),
      distanceMeters: this.distanceMeters,
      coins: this.coins,
      relics: this.relics,
      multiplier: this.multiplier,
      lives: this.lives,
      shieldActive: this.shieldActive,
      magnetActive: this.magnetActive,
      currentBiome: this.currentBiome
    });
  }
}
