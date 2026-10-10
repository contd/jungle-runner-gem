/**
 * Jungle Run - BootScene
 * Preloads imagery and procedurally synthesizes pixel-perfect textures and sprite frames
 * for all character skins, hazards, collectibles, and terrain.
 */

import Phaser from 'phaser';

// Asset paths
import canopyBg from '../../assets/images/jungle_biome_canopy_1791667998523.jpg';
import templeBg from '../../assets/images/jungle_biome_temple_1791667989618.jpg';
import goldIdolImg from '../../assets/images/jungle_artifact_gold_idol_1791668007403.jpg';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Load generated high-fidelity environmental backdrops
    this.load.image('bg_canopy', canopyBg);
    this.load.image('bg_temple', templeBg);
    this.load.image('img_gold_idol', goldIdolImg);
  }

  create() {
    this.generateProceduralSprites();
    this.scene.start('GameScene');
  }

  private generateProceduralSprites() {
    this.createGroundTiles();
    this.createPlayerSkins();
    this.createHazards();
    this.createCollectibles();
    this.createParticles();
  }

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

  private createPlayerSkins() {
    const skinThemes = [
      { id: 'harry', shirt: '#d4af37', pants: '#3e2723', hat: '#5d4037', skin: '#f5cba7' },
      { id: 'maya', shirt: '#10b981', pants: '#1e293b', hat: '#064e3b', skin: '#e0ac69' },
      { id: 'leo', shirt: '#ef4444', pants: '#374151', hat: '#7f1d1d', skin: '#ffdbac' }
    ];

    skinThemes.forEach(theme => {
      // 1. Run animation sheet (4 frames of 48x64)
      const runCanvas = this.textures.createCanvas(`player_${theme.id}_run`, 192, 64);
      if (runCanvas) {
        const ctx = runCanvas.getContext();
        for (let f = 0; f < 4; f++) {
          const ox = f * 48;
          this.drawPlayerFrame(ctx, ox, 0, theme, 'run', f);
        }
        runCanvas.refresh();

        for (let f = 0; f < 4; f++) {
          runCanvas.add(String(f), 0, f * 48, 0, 48, 64);
        }

        // Register Phaser animation
        this.anims.create({
          key: `run_${theme.id}`,
          frames: [
            { key: `player_${theme.id}_run`, frame: '0' },
            { key: `player_${theme.id}_run`, frame: '1' },
            { key: `player_${theme.id}_run`, frame: '2' },
            { key: `player_${theme.id}_run`, frame: '3' }
          ],
          frameRate: 10,
          repeat: -1
        });
      }

      // 2. Jump Sprite (48x64)
      const jumpCanvas = this.textures.createCanvas(`player_${theme.id}_jump`, 48, 64);
      if (jumpCanvas) {
        const ctx = jumpCanvas.getContext();
        this.drawPlayerFrame(ctx, 0, 0, theme, 'jump', 0);
        jumpCanvas.refresh();
      }

      // 3. Slide Sprite (64x36)
      const slideCanvas = this.textures.createCanvas(`player_${theme.id}_slide`, 64, 36);
      if (slideCanvas) {
        const ctx = slideCanvas.getContext();
        this.drawPlayerSlideFrame(ctx, 0, 0, theme);
        slideCanvas.refresh();
      }

      // 4. Swing Sprite (48x64)
      const swingCanvas = this.textures.createCanvas(`player_${theme.id}_swing`, 48, 64);
      if (swingCanvas) {
        const ctx = swingCanvas.getContext();
        this.drawPlayerFrame(ctx, 0, 0, theme, 'swing', 0);
        swingCanvas.refresh();
      }
    });
  }

  private drawPlayerFrame(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    theme: any,
    pose: 'run' | 'jump' | 'swing',
    frame: number
  ) {
    const cx = ox + 24;

    // Fedora Hat
    ctx.fillStyle = theme.hat;
    ctx.fillRect(cx - 14, oy + 8, 28, 6);
    ctx.fillRect(cx - 9, oy + 2, 18, 8);
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - 9, oy + 8, 18, 2);

    // Face / Head
    ctx.fillStyle = theme.skin;
    ctx.fillRect(cx - 8, oy + 14, 16, 12);
    // Eye
    ctx.fillStyle = '#111';
    ctx.fillRect(cx + 3, oy + 17, 3, 3);

    // Torso / Jacket
    ctx.fillStyle = theme.shirt;
    ctx.fillRect(cx - 9, oy + 26, 18, 18);
    // Belt & Buckle
    ctx.fillStyle = '#2b1b11';
    ctx.fillRect(cx - 10, oy + 42, 20, 4);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(cx - 2, oy + 42, 4, 4);

    // Limbs based on pose
    ctx.fillStyle = theme.pants;
    if (pose === 'run') {
      const legOffsets = [
        [-8, 6, 8, -6],
        [-4, 2, 4, -2],
        [8, -6, -8, 6],
        [4, -2, -4, 2]
      ][frame % 4];

      // Left leg
      ctx.fillRect(cx - 7, oy + 46, 6, 12 + legOffsets[0]);
      // Right leg
      ctx.fillRect(cx + 1, oy + 46, 6, 12 + legOffsets[2]);
      // Boots
      ctx.fillStyle = '#1f130b';
      ctx.fillRect(cx - 8, oy + 56 + legOffsets[0], 8, 6);
      ctx.fillRect(cx, oy + 56 + legOffsets[2], 8, 6);

      // Arms
      ctx.fillStyle = theme.shirt;
      ctx.fillRect(cx - 12 + legOffsets[2], oy + 28, 5, 12);
      ctx.fillRect(cx + 8 + legOffsets[0], oy + 28, 5, 12);
    } else if (pose === 'jump') {
      // Tucked athletic legs
      ctx.fillRect(cx - 8, oy + 44, 7, 10);
      ctx.fillRect(cx + 1, oy + 44, 7, 14);
      // Boots
      ctx.fillStyle = '#1f130b';
      ctx.fillRect(cx - 9, oy + 52, 9, 6);
      ctx.fillRect(cx + 1, oy + 56, 9, 6);
      // Arms raised
      ctx.fillStyle = theme.shirt;
      ctx.fillRect(cx - 12, oy + 18, 5, 12);
      ctx.fillRect(cx + 7, oy + 16, 5, 12);
    } else if (pose === 'swing') {
      // Arms holding vine overhead
      ctx.fillStyle = theme.skin;
      ctx.fillRect(cx - 6, oy - 2, 12, 6);
      ctx.fillStyle = theme.shirt;
      ctx.fillRect(cx - 9, oy + 4, 6, 22);
      ctx.fillRect(cx + 3, oy + 4, 6, 22);
      // Legs dangling angled
      ctx.fillStyle = theme.pants;
      ctx.fillRect(cx - 8, oy + 46, 6, 14);
      ctx.fillRect(cx - 2, oy + 48, 6, 14);
      // Boots
      ctx.fillStyle = '#1f130b';
      ctx.fillRect(cx - 7, oy + 58, 8, 5);
      ctx.fillRect(cx - 1, oy + 60, 8, 5);
    }
  }

  private drawPlayerSlideFrame(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    theme: any
  ) {
    // Sliding player lying low horizontally
    // Head & Hat
    ctx.fillStyle = theme.hat;
    ctx.fillRect(ox + 42, oy + 6, 18, 6);
    ctx.fillRect(ox + 44, oy + 2, 14, 6);
    ctx.fillStyle = theme.skin;
    ctx.fillRect(ox + 40, oy + 12, 14, 10);
    // Torso
    ctx.fillStyle = theme.shirt;
    ctx.fillRect(ox + 20, oy + 12, 22, 14);
    // Legs outstretched behind
    ctx.fillStyle = theme.pants;
    ctx.fillRect(ox + 4, oy + 16, 18, 12);
    // Boots
    ctx.fillStyle = '#1f130b';
    ctx.fillRect(ox, oy + 16, 6, 12);
  }

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
