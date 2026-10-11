/**
 * Jungle Run - BootScene
 * Preloads imagery and procedurally synthesizes pixel-perfect textures and sprite frames
 * for all character skins, hazards, collectibles, and terrain.
 * @module game/scenes/BootScene
 */

import Phaser from 'phaser';
import type { GameSceneInitData } from './GameScene.ts';
import {
  CHARACTER_SHEETS, EXPLORER_IDS, recolorCharacterPixels
} from '../systems/characterAssets.ts';
import type { CharacterPose } from '../systems/characterAssets.ts';

// Asset paths
import canopyBg from '../../assets/images/jungle_biome_canopy_1791667998523.jpg';
import templeBg from '../../assets/images/jungle_biome_temple_1791667989618.jpg';
import goldIdolImg from '../../assets/images/jungle_artifact_gold_idol_1791668007403.jpg';

/**
 * Asset initialization scene: Vite-bundled backgrounds plus Canvas-generated textures.
 * Texture/animation keys form the contract consumed by GameScene; calling each
 * Canvas texture's refresh uploads its drawing before gameplay begins.
 */
export class BootScene extends Phaser.Scene {
  /** Complete run configuration forwarded only after textures have finished loading. */
  private readonly gameplayData: GameSceneInitData;
  /** Register the stable boot key selected first by the Phaser bridge. */
  constructor(gameplayData: GameSceneInitData) {
    super({ key: 'BootScene' });
    this.gameplayData = gameplayData;
  }

  /** Queue bundled canopy, temple, and idol images under stable Phaser texture keys. */
  preload() {
    // Load generated high-fidelity environmental backdrops
    this.load.image('bg_canopy', canopyBg);
    this.load.image('bg_temple', templeBg);
    this.load.image('img_gold_idol', goldIdolImg);
    for (const [pose, sheet] of Object.entries(CHARACTER_SHEETS)) {
      this.load.image(`character_source_${pose}`, sheet.url);
    }
  }

  /** Generate gameplay textures/animations, then start GameScene through Phaser's scene manager. */
  create() {
    this.generateProceduralSprites();
    this.scene.start('GameScene', this.gameplayData);
  }

  /** Initialize terrain, character poses, hazard/pickup textures, and particle primitives. */
  private generateProceduralSprites() {
    this.createGroundTiles();
    this.createPlayerSkins();
    this.createHazards();
    this.createCollectibles();
    this.createParticles();
  }

  /** Draw 64-by-64 terrain tiles; collision/terrain gaps are configured by GameScene. */
  private createGroundTiles() {
    // 1. Jungle Ground Tile (64x64)
    const groundCanvas = this.textures.createCanvas('tile_ground', 64, 64);
    if (groundCanvas) {
      const ctx = groundCanvas.getContext();
      // Rich jungle dirt
      ctx.fillStyle = '#2d1b0e';
      ctx.fillRect(0, 0, 64, 64);
      // Grass top layer
      ctx.fillStyle = '#1e5e29';
      ctx.fillRect(0, 0, 64, 14);
      ctx.fillStyle = '#2da344';
      ctx.fillRect(0, 0, 64, 6);
      // Small stones and roots
      ctx.fillStyle = '#4a2f1c';
      ctx.fillRect(10, 25, 8, 5);
      ctx.fillRect(40, 40, 12, 6);
      ctx.fillRect(25, 52, 6, 4);
      groundCanvas.refresh();
    }

    // 2. Swamp / Water Lagoon Tile (64x64)
    const waterCanvas = this.textures.createCanvas('tile_water', 64, 64);
    if (waterCanvas) {
      const ctx = waterCanvas.getContext();
      ctx.fillStyle = '#0f382a';
      ctx.fillRect(0, 0, 64, 64);
      // Surface ripples
      ctx.fillStyle = '#1b6e54';
      ctx.fillRect(0, 0, 64, 10);
      ctx.fillStyle = '#34d399';
      ctx.fillRect(8, 2, 20, 3);
      ctx.fillRect(36, 6, 18, 2);
      waterCanvas.refresh();
    }

    // 3. Quicksand Mud Tile (64x64)
    const mudCanvas = this.textures.createCanvas('tile_quicksand', 64, 64);
    if (mudCanvas) {
      const ctx = mudCanvas.getContext();
      ctx.fillStyle = '#3a2717';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#654321';
      ctx.fillRect(0, 0, 64, 12);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(12, 3, 16, 4);
      ctx.fillRect(38, 5, 14, 3);
      mudCanvas.refresh();
    }
  }

  /** Build palette variants from the outlined asset pack, retaining fixed collision-frame geometry. */
  private createPlayerSkins() {
    for (const explorer of EXPLORER_IDS) {
      for (const pose of Object.keys(CHARACTER_SHEETS) as CharacterPose[]) {
        const sheet = CHARACTER_SHEETS[pose];
        const source = this.textures.get(`character_source_${pose}`).getSourceImage();
        if (!(source instanceof HTMLImageElement)
          || source.naturalWidth !== sheet.width * sheet.frames || source.naturalHeight !== sheet.height) {
          throw new Error(`Missing or invalid character sheet: ${pose}`);
        }
        const key = `player_${explorer}_${pose}`;
        const texture = this.textures.createCanvas(key, sheet.width * sheet.frames, sheet.height);
        if (!texture) throw new Error(`Cannot create character texture: ${key}`);
        const context = texture.getContext();
        context.imageSmoothingEnabled = false;
        context.drawImage(source, 0, 0);
        const image = context.getImageData(0, 0, source.naturalWidth, source.naturalHeight);
        recolorCharacterPixels(image.data, explorer);
        context.putImageData(image, 0, 0);
        texture.refresh();
        texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        for (let frame = 0; frame < sheet.frames; frame++) {
          texture.add(String(frame), 0, frame * sheet.width, 0, sheet.width, sheet.height);
        }
        if (sheet.frames > 1) {
          this.anims.create({
            key: `${pose}_${explorer}`,
            frames: Array.from({ length: sheet.frames }, (_, frame) => ({ key, frame: String(frame) })),
            frameRate: 10,
            repeat: -1
          });
        }
      }
    }
  }

  /**
   * Draw crocodile, boulder, log, branch, spikes, snake, vine, and bridge textures.
   * These are visuals only: bodies, motion, and collision effects are configured in gameplay.
   */
  private createHazards() {
    // 1. Crocodile (72x36)
    const crocCanvas = this.textures.createCanvas('hazard_crocodile', 72, 36);
    if (crocCanvas) {
      const ctx = crocCanvas.getContext();
      // Scaly green back
      ctx.fillStyle = '#1b4d24';
      ctx.fillRect(0, 14, 72, 18);
      ctx.fillStyle = '#2b7538';
      ctx.fillRect(8, 10, 54, 8);
      // Spikes on back
      ctx.fillStyle = '#0d2812';
      ctx.fillRect(16, 6, 6, 5);
      ctx.fillRect(30, 6, 6, 5);
      ctx.fillRect(44, 6, 6, 5);
      // Yellow eyes
      ctx.fillStyle = '#facc15';
      ctx.fillRect(52, 6, 6, 5);
      ctx.fillStyle = '#000';
      ctx.fillRect(55, 7, 2, 3);
      // Jaws & sharp teeth
      ctx.fillStyle = '#1b4d24';
      ctx.fillRect(54, 12, 18, 12);
      ctx.fillStyle = '#fff';
      ctx.fillRect(58, 18, 3, 3);
      ctx.fillRect(64, 18, 3, 3);
      crocCanvas.refresh();
    }

    // 2. Rolling Boulder (64x64)
    const boulderCanvas = this.textures.createCanvas('hazard_boulder', 64, 64);
    if (boulderCanvas) {
      const ctx = boulderCanvas.getContext();
      ctx.save();
      ctx.beginPath();
      ctx.arc(32, 32, 30, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      // Stone sphere
      ctx.fillStyle = '#5c544d';
      ctx.fillRect(0, 0, 64, 64);
      // Cracks and moss
      ctx.fillStyle = '#3a342f';
      ctx.fillRect(10, 15, 24, 6);
      ctx.fillRect(28, 20, 6, 22);
      ctx.fillRect(38, 38, 18, 5);
      ctx.fillStyle = '#2e5630';
      ctx.fillRect(8, 35, 14, 10);
      ctx.restore();
      boulderCanvas.refresh();
    }

    // 3. Fallen Log (56x32)
    const logCanvas = this.textures.createCanvas('hazard_log', 56, 32);
    if (logCanvas) {
      const ctx = logCanvas.getContext();
      ctx.fillStyle = '#4a2f1c';
      ctx.fillRect(0, 8, 56, 24);
      ctx.fillStyle = '#6b4429';
      ctx.fillRect(4, 12, 48, 8);
      ctx.fillStyle = '#27170a';
      ctx.fillRect(0, 8, 8, 24); // Cut ring
      // Moss on top
      ctx.fillStyle = '#227b38';
      ctx.fillRect(8, 5, 24, 4);
      logCanvas.refresh();
    }

    // 4. Overhead Branch (140x44)
    const branchCanvas = this.textures.createCanvas('hazard_branch', 140, 44);
    if (branchCanvas) {
      const ctx = branchCanvas.getContext();
      // Gnarled wood branch
      ctx.fillStyle = '#3a2312';
      ctx.fillRect(0, 0, 140, 20);
      ctx.fillStyle = '#55341c';
      ctx.fillRect(0, 4, 140, 8);
      // Dangling thorns & vines
      ctx.fillStyle = '#1c4a23';
      ctx.fillRect(20, 18, 8, 22);
      ctx.fillRect(50, 18, 12, 26);
      ctx.fillRect(85, 18, 10, 20);
      ctx.fillRect(115, 18, 8, 24);
      branchCanvas.refresh();
    }

    // 5. Ancient Spikes (60x30)
    const spikesCanvas = this.textures.createCanvas('hazard_spikes', 60, 30);
    if (spikesCanvas) {
      const ctx = spikesCanvas.getContext();
      ctx.fillStyle = '#71717a';
      for (let i = 0; i < 4; i++) {
        const sx = i * 15;
        ctx.beginPath();
        ctx.moveTo(sx, 30);
        ctx.lineTo(sx + 7.5, 0);
        ctx.lineTo(sx + 15, 30);
        ctx.closePath();
        ctx.fill();
      }
      spikesCanvas.refresh();
    }

    // 6. Serpent Snake (40x25)
    const snakeCanvas = this.textures.createCanvas('hazard_snake', 40, 25);
    if (snakeCanvas) {
      const ctx = snakeCanvas.getContext();
      ctx.fillStyle = '#15803d';
      ctx.fillRect(0, 14, 40, 10);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(8, 10, 10, 6);
      ctx.fillRect(24, 10, 10, 6);
      // Head raised
      ctx.fillStyle = '#15803d';
      ctx.fillRect(30, 4, 10, 12);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(38, 10, 4, 2); // Tongue
      snakeCanvas.refresh();
    }

    // 7. Swinging Vine Segment (16x240)
    const vineCanvas = this.textures.createCanvas('obj_vine', 16, 240);
    if (vineCanvas) {
      const ctx = vineCanvas.getContext();
      ctx.fillStyle = '#275931';
      ctx.fillRect(6, 0, 4, 240);
      // Leaves along the vine
      ctx.fillStyle = '#34a853';
      for (let y = 20; y < 240; y += 40) {
        ctx.fillRect(0, y, 6, 10);
        ctx.fillRect(10, y + 20, 6, 10);
      }
      vineCanvas.refresh();
    }

    // 8. Collapsing Wooden Bridge Plank (64x18)
    const plankCanvas = this.textures.createCanvas('hazard_plank', 64, 18);
    if (plankCanvas) {
      const ctx = plankCanvas.getContext();
      ctx.fillStyle = '#5c3a21';
      ctx.fillRect(0, 2, 64, 14);
      ctx.fillStyle = '#7a4e2d';
      ctx.fillRect(2, 4, 60, 10);
      // Rope bindings on sides
      ctx.fillStyle = '#d97706';
      ctx.fillRect(2, 0, 4, 18);
      ctx.fillRect(58, 0, 4, 18);
      plankCanvas.refresh();
    }
  }

  /** Draw coin/relic/shield/magnet textures matching the scene's pickup type keys. */
  private createCollectibles() {
    // 1. Gold Coin (24x24)
    const coinCanvas = this.textures.createCanvas('item_coin', 24, 24);
    if (coinCanvas) {
      const ctx = coinCanvas.getContext();
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.arc(12, 12, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(10, 10, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(12, 12, 10, 0, Math.PI * 2);
      ctx.stroke();
      coinCanvas.refresh();
    }

    // 2. Ancient Relic Gem (32x32)
    const relicCanvas = this.textures.createCanvas('item_relic', 32, 32);
    if (relicCanvas) {
      const ctx = relicCanvas.getContext();
      // Glowing golden ruby gem
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(16, 2);
      ctx.lineTo(28, 12);
      ctx.lineTo(22, 28);
      ctx.lineTo(10, 28);
      ctx.lineTo(4, 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(12, 8, 8, 8);
      relicCanvas.refresh();
    }

    // 3. Shield Power-up (32x32)
    const shieldCanvas = this.textures.createCanvas('powerup_shield', 32, 32);
    if (shieldCanvas) {
      const ctx = shieldCanvas.getContext();
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(16, 16, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(14, 8, 4, 16);
      ctx.fillRect(8, 14, 16, 4);
      shieldCanvas.refresh();
    }

    // 4. Magnet Power-up (32x32)
    const magnetCanvas = this.textures.createCanvas('powerup_magnet', 32, 32);
    if (magnetCanvas) {
      const ctx = magnetCanvas.getContext();
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(16, 16, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(8, 8, 6, 12);
      ctx.fillRect(18, 8, 6, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, 6, 6, 3);
      ctx.fillRect(18, 6, 6, 3);
      magnetCanvas.refresh();
    }
  }

  /** Register small dust, water, and sparkle primitives for particle emitters. */
  private createParticles() {
    // Dust puff particle (8x8)
    const dustCanvas = this.textures.createCanvas('part_dust', 8, 8);
    if (dustCanvas) {
      const ctx = dustCanvas.getContext();
      ctx.fillStyle = 'rgba(210, 180, 140, 0.7)';
      ctx.beginPath();
      ctx.arc(4, 4, 3, 0, Math.PI * 2);
      ctx.fill();
      dustCanvas.refresh();
    }

    // Water droplet particle (6x6)
    const waterPartCanvas = this.textures.createCanvas('part_water', 6, 6);
    if (waterPartCanvas) {
      const ctx = waterPartCanvas.getContext();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.beginPath();
      ctx.arc(3, 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      waterPartCanvas.refresh();
    }

    // Sparkle star (8x8)
    const sparkCanvas = this.textures.createCanvas('part_sparkle', 8, 8);
    if (sparkCanvas) {
      const ctx = sparkCanvas.getContext();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(3, 0, 2, 8);
      ctx.fillRect(0, 3, 8, 2);
      sparkCanvas.refresh();
    }
  }
}
