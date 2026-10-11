/**
 * Rebuild Phaser-ready PNG sheets from the supplied outlined character artwork.
 * Requires ImageMagick 7 (`magick`) locally; generated PNGs are committed so normal
 * builds require no graphics tools. GIF disposal is coalesced before conversion.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'jungle-asset-pack/ Chacter with outline/sprites');
const target = path.join(root, 'src/assets/characters');
mkdirSync(target, { recursive: true });

/** All original animations use 100 ms frames; standing sheets use 48-by-64 cells. */
const poses = [
  ['run', 'run outline.gif', false],
  ['idle', 'idle outline.gif', false],
  ['air', 'mid air outline.gif', false],
  ['swing', 'ledge grab outline.gif', false],
  ['jump', 'jump outline.png', false],
  ['landing', 'landing outline.png', false],
  ['slide', 'landing outline.png', true]
];
for (const [pose, filename, slide] of poses) {
  // Nearest-neighbor 1.5x art, bottom aligned, keeps standing bodies at their old size.
  // The low slide is an intentional flattened landing-pose adaptation, not authored animation.
  const args = [
    path.join(source, filename), '-coalesce', '-filter', 'point',
    '-resize', slide ? '52x28!' : '150%',
    '-background', 'none', '-gravity', 'south',
    '-extent', slide ? '64x36' : '48x64', '+repage',
    '+append', path.join(target, `${pose}.png`)
  ];
  const result = spawnSync('magick', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Character conversion failed (${pose}): ${result.stderr}`);
  console.log(`Generated ${pose}.png`);
}
