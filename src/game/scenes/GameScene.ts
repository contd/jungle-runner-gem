/**
 * Jungle Run - Main GameScene
 * Complete endless runner with physics, parallax, vine swinging, crocodiles,
 * rolling boulders, collectibles, power-ups, and audio triggers.
 */

import Phaser from 'phaser';
import { ProceduralWorldGenerator, ChunkDefinition, BiomeType } from '../systems/ProceduralGenerator.ts';
import { soundManager } from '../audio/SoundManager.ts';
import { InputManager } from '../input/InputManager.ts';
import { GameMode } from '../../data/types.ts';

export interface GameSceneInitData {
  inputManager: InputManager;
  characterId: string;
  gameMode: GameMode;
  seed: number;
  screenShakeEnabled: boolean;
  onStatsUpdate: (stats: GameHUDStats) => void;
  onGameOver: (result: GameOverData) => void;
}

export interface GameHUDStats {
  score: number;
  distanceMeters: number;
  coins: number;
  relics: number;
  multiplier: number;
  lives: number;
  shieldActive: boolean;
  magnetActive: boolean;
  currentBiome: BiomeType;
}

export interface GameOverData {
  score: number;
  distanceMeters: number;
  coins: number;
  relics: number;
  hazardsAvoided: number;
  vinesSwung: number;
  causeOfDeath: string;
  seed: number;
}

interface ActiveVine {
  sprite: Phaser.GameObjects.Sprite;
  anchorX: number;
  anchorY: number;
  length: number;
  angle: number;
  speed: number;
  timeOffset: number;
}

export class GameScene extends Phaser.Scene {
  private inputManager!: InputManager;
  private characterId = 'harry';
  private gameMode: GameMode = 'endless';
  private runSeed = 1337;
  private screenShakeEnabled = true;

  private onStatsUpdateCallback!: (stats: GameHUDStats) => void;
  private onGameOverCallback!: (result: GameOverData) => void;

  // World & Generation
  private generator!: ProceduralWorldGenerator;
  private groundY = 520;
  private currentDistancePixels = 0;
  private distanceMeters = 0;
  private score = 0;
  private coins = 0;
  private relics = 0;
  private multiplier = 1;
  private comboStreak = 0;
  private hazardsAvoided = 0;
  private vinesSwung = 0;
  private lives = 3;
  private isGameOver = false;
  private isInvulnerable = false;
  private invulnerableTimer = 0;

  // Powerups
  private shieldActive = false;
  private magnetActive = false;
  private magnetTimer = 0;

  // Runner Speed
  private baseRunSpeed = 290;
  private currentRunSpeed = 290;

  // Player Entity
  private player!: Phaser.Physics.Arcade.Sprite;
  private isSliding = false;
  private slideTimer = 0;
  private isSwingingOnVine = false;
  private attachedVine: ActiveVine | null = null;
  private dustEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  // Background Parallax
  private bgCanopyTile!: Phaser.GameObjects.TileSprite;
  private bgTempleTile!: Phaser.GameObjects.TileSprite;
  private distantSkyGraphics!: Phaser.GameObjects.Graphics;

  // World Entity Groups
  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;
  private hazardsGroup!: Phaser.Physics.Arcade.Group;
  private bouldersGroup!: Phaser.Physics.Arcade.Group;
  private coinsGroup!: Phaser.Physics.Arcade.Group;
  private relicsGroup!: Phaser.Physics.Arcade.Group;
  private powerupsGroup!: Phaser.Physics.Arcade.Group;
  private activeVines: ActiveVine[] = [];

  // Procedural Spawning tracking
  private lastSpawnedX = 0;
  private currentBiome: BiomeType = 'canopy';

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneInitData) {
    this.inputManager = data.inputManager;
    this.characterId = data.characterId || 'harry';
    this.gameMode = data.gameMode || 'endless';
    this.runSeed = data.seed || Math.floor(Math.random() * 1000000);
    this.screenShakeEnabled = data.screenShakeEnabled !== false;
    this.onStatsUpdateCallback = data.onStatsUpdate || (() => {});
    this.onGameOverCallback = data.onGameOver || (() => {});

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
  }

  create() {
    this.generator = new ProceduralWorldGenerator(this.runSeed);

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
    this.inputManager.onAction('jump', (pressed) => {
      if (pressed) this.handleJumpAction();
    });
    this.inputManager.onAction('slide', (pressed) => {
      if (pressed) this.handleSlideAction();
    });
    this.inputManager.onAction('interact', (pressed) => {
      if (pressed) this.handleInteractAction();
    });

    // Start Procedural Music
    soundManager.startMusic();
  }

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

  private createPlayer() {
    this.player = this.physics.add.sprite(180, this.groundY - 60, `player_${this.characterId}_run`);
    this.player.setCollideWorldBounds(false);
    this.player.setSize(30, 54);
    this.player.setOffset(9, 10);
    this.player.setGravityY(1200);

    this.player.play(`run_${this.characterId}`);

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

  private spawnSafeRunway(width: number) {
    const tileW = 64;
    for (let x = 0; x < width; x += tileW) {
      const tile = this.groundGroup.create(x + tileW / 2, this.groundY + 32, 'tile_ground') as Phaser.Physics.Arcade.Sprite;
      tile.refreshBody();
    }
    this.lastSpawnedX = width;
  }

  private spawnNextWorldChunk() {
    const chunk = this.generator.getNextChunk(this.distanceMeters);
    this.currentBiome = chunk.biome;
    const startX = this.lastSpawnedX;
    const chunkW = chunk.width;
    const tileW = 64;

    // Collect pit/water gaps
    const pitIntervals: Array<{ start: number; end: number; type: string }> = [];
    chunk.obstacles.forEach(obs => {
      if (obs.type === 'pit' || obs.type === 'water_lagoon' || obs.type === 'quicksand') {
        const obsWidth = obs.width || 140;
        pitIntervals.push({
          start: startX + obs.xOffset - obsWidth / 2,
          end: startX + obs.xOffset + obsWidth / 2,
          type: obs.type
        });
      }
    });

    // Spawn Ground / Water Tiles
    for (let x = startX; x < startX + chunkW; x += tileW) {
      const midX = x + tileW / 2;
      const inPit = pitIntervals.find(p => midX >= p.start && midX <= p.end);

      if (inPit) {
        if (inPit.type === 'water_lagoon') {
          this.add.tileSprite(midX, this.groundY + 32, tileW, 64, 'tile_water');
        } else if (inPit.type === 'quicksand') {
          const quicksand = this.hazardsGroup.create(midX, this.groundY + 32, 'tile_quicksand') as Phaser.Physics.Arcade.Sprite;
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

  private handleJumpAction() {
    if (this.isGameOver) return;

    if (this.isSwingingOnVine) {
      // Launch off vine with forward momentum
      this.isSwingingOnVine = false;
      this.attachedVine = null;
      this.player.body!.enable = true;
      (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
      this.player.setVelocity(this.currentRunSpeed + 130, -460);
      this.player.setTexture(`player_${this.characterId}_jump`);
      soundManager.playVineSwing();
      this.vinesSwung++;
      this.score += 250 * this.multiplier;
      this.triggerCombo();
      return;
    }

    const onFloor = this.player.body?.blocked.down || this.player.body?.touching.down;
    if (onFloor && !this.isSliding) {
      this.player.setVelocityY(-540);
      this.player.setTexture(`player_${this.characterId}_jump`);
      soundManager.playJump();

      if (this.dustEmitter) {
        this.dustEmitter.emitParticleAt(this.player.x, this.player.y + 24, 6);
      }
    }
  }

  private handleSlideAction() {
    if (this.isGameOver || this.isSwingingOnVine) return;
    const onFloor = this.player.body?.blocked.down || this.player.body?.touching.down;

    if (onFloor && !this.isSliding) {
      this.isSliding = true;
      this.slideTimer = 440; // ms
      this.player.setTexture(`player_${this.characterId}_slide`);
      this.player.setSize(52, 24);
      this.player.setOffset(4, 10);
      soundManager.playSlide();

      if (this.dustEmitter) {
        this.dustEmitter.emitParticleAt(this.player.x - 10, this.player.y + 14, 8);
      }
    }
  }

  private handleInteractAction() {
    // If near vine and not yet swinging, latch onto vine
    if (this.isGameOver || this.isSwingingOnVine) return;
    this.checkForVineAttachment();
  }

  private checkForVineAttachment(): boolean {
    const px = this.player.x;
    const py = this.player.y;

    for (const vine of this.activeVines) {
      const tipX = vine.anchorX + Math.sin(vine.angle) * vine.length;
      const tipY = vine.anchorY + Math.cos(vine.angle) * vine.length;

      const dist = Phaser.Math.Distance.Between(px, py, tipX, tipY);
      if (dist < 60) {
        this.attachToVine(vine);
        return true;
      }
    }
    return false;
  }

  private attachToVine(vine: ActiveVine) {
    this.isSwingingOnVine = true;
    this.attachedVine = vine;
    this.isSliding = false;
    this.player.setVelocity(0, 0);
    this.player.body!.enable = false;
    this.player.setTexture(`player_${this.characterId}_swing`);
    soundManager.playVineGrab();
  }

  private onPlayerLandGround() {
    if (this.isGameOver || this.isSwingingOnVine) return;

    if (!this.isSliding && this.player.anims.currentAnim?.key !== `run_${this.characterId}`) {
      this.player.play(`run_${this.characterId}`);
      this.player.setSize(30, 54);
      this.player.setOffset(9, 10);
    }
  }

  // --- Collisions & Hazards ---

  private onHitHazard(_player: any, hazard: any) {
    if (this.isGameOver || this.isInvulnerable) return;

    const hazardType = hazard.getData('hazardType');

    // Crocodile Closed Mouth Bounce Mechanic
    if (hazardType === 'crocodile') {
      const isFalling = this.player.body?.velocity.y! > 0;
      const hitFromAbove = this.player.y < hazard.y - 10;
      if (isFalling && hitFromAbove) {
        // Player bounced safely on top of crocodile!
        this.player.setVelocityY(-480);
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

  private onHitBoulder(_player: any, _boulder: any) {
    if (this.isGameOver || this.isInvulnerable) return;
    this.takeDamage('rolling_boulder');
  }

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

  private onCollectCoin(_player: any, coin: any) {
    coin.destroy();
    this.coins++;
    this.score += 100 * this.multiplier;
    soundManager.playCoin();
    this.triggerCombo();
  }

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

  private triggerCombo() {
    this.comboStreak++;
    if (this.comboStreak >= 5 && this.multiplier < 5) {
      this.multiplier = Math.min(5, Math.floor(this.comboStreak / 4) + 1);
    }
  }

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

  update(time: number, delta: number) {
    if (this.isGameOver) return;

    const deltaSec = delta / 1000;

    // Difficulty Speed Scaling
    this.currentRunSpeed = this.baseRunSpeed + Math.min(130, this.distanceMeters * 0.07);

    // Active Sliding State
    if (this.isSliding) {
      this.slideTimer -= delta;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
        this.player.setSize(30, 54);
        this.player.setOffset(9, 10);
        this.player.play(`run_${this.characterId}`);
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
      const tipX = vine.anchorX + Math.sin(vine.angle) * vine.length;
      const tipY = vine.anchorY + Math.cos(vine.angle) * vine.length;

      this.player.setPosition(tipX, tipY);

      // Auto check release if swinging forward near apex
      if (vine.angle > 0.45) {
        // Can auto release or player taps jump
      }
    } else {
      // Normal Runner Forward Movement
      this.player.setVelocityX(this.currentRunSpeed);
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
