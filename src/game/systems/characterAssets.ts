/**
 * Outlined asset-pack character sheets and palette-only explorer variants.
 * Generated PNGs preserve all original GIF frames at 10 FPS; slide is an adapted
 * landing pose and swing uses ledge-grab. Geometry and gameplay remain scene-owned.
 * @module game/systems/characterAssets
 */
import run from '../../assets/characters/run.png';
import idle from '../../assets/characters/idle.png';
import air from '../../assets/characters/air.png';
import swing from '../../assets/characters/swing.png';
import jump from '../../assets/characters/jump.png';
import landing from '../../assets/characters/landing.png';
import slide from '../../assets/characters/slide.png';

/** Existing saved explorer IDs; no profile migration or unlock change is needed. */
export type ExplorerId = 'harry' | 'maya' | 'leo';
/** Supported renderer poses, including authored airborne and idle animations. */
export type CharacterPose = 'run' | 'idle' | 'air' | 'swing' | 'jump' | 'landing' | 'slide';
/** Packed horizontal sheet geometry. */
export interface CharacterSheet {
  /** Bundled PNG URL. */
  url: string;
  /** Width of one frame in virtual pixels. */
  width: number;
  /** Height of one frame in virtual pixels. */
  height: number;
  /** Number of horizontal cells; no GIF frames are dropped. */
  frames: number;
}
/** Phaser sheet contracts; every standing pose retains a 48-by-64 cell. */
export const CHARACTER_SHEETS: Record<CharacterPose, CharacterSheet> = {
  run: { url: run, width: 48, height: 64, frames: 8 },
  idle: { url: idle, width: 48, height: 64, frames: 12 },
  air: { url: air, width: 48, height: 64, frames: 2 },
  swing: { url: swing, width: 48, height: 64, frames: 6 },
  jump: { url: jump, width: 48, height: 64, frames: 1 },
  landing: { url: landing, width: 48, height: 64, frames: 1 },
  slide: { url: slide, width: 64, height: 36, frames: 1 }
};
/** Shared raised-hand pivot across all six 48-by-64 ledge-grab frames. */
export const SWING_GRIP = {
  /** Hand X measured from the frame's left edge, in pixels. */
  x: 35,
  /** Hand Y measured from the frame's top edge, in pixels. */
  y: 15
};
/** Original teal shirt shades; exact mapping avoids tinting faces, hair, and outlines. */
const SHIRT_COLORS = [0x172d3b, 0x244b57, 0x245257, 0x418079, 0x6ec09b];
/** Dark-to-light shirt variants matching each explorer's gold/green/red identity. */
const SHIRT_VARIANTS: Record<ExplorerId, readonly number[]> = {
  harry: [0x40341d, 0x655127, 0x6c582a, 0x9c823b, 0xd4af57],
  maya: [0x06392f, 0x065743, 0x07664e, 0x109b72, 0x34d399],
  leo: [0x451b25, 0x702532, 0x812a35, 0xbc4248, 0xef7777]
};
/** Palette variants use existing stable IDs, keeping saved selection and unlocks intact. */
export const EXPLORER_IDS: readonly ExplorerId[] = ['harry', 'maya', 'leo'];

/**
 * Recolor only exact opaque shirt pixels in an RGBA buffer in place.
 * Transparent pixels and all other art colors remain byte-for-byte unchanged.
 */
export function recolorCharacterPixels(pixels: Uint8ClampedArray, explorer: ExplorerId): void {
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] !== 255) continue;
    const color = (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2];
    const shade = SHIRT_COLORS.indexOf(color);
    if (shade < 0) continue;
    const replacement = SHIRT_VARIANTS[explorer][shade];
    pixels[offset] = (replacement >>> 16) & 255;
    pixels[offset + 1] = (replacement >>> 8) & 255;
    pixels[offset + 2] = replacement & 255;
  }
}
