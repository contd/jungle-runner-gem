/**
 * Asset sheet dimensions/frame counts and exact palette conversion regressions.
 * PNG headers are read directly so tests require no image decoder or graphics tool.
 * @module tests/characterAssets
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_SHEETS, EXPLORER_IDS, recolorCharacterPixels } from '../src/game/systems/characterAssets.ts';

describe('Outlined character sheets', () => {
  /** Every original GIF frame must fit its declared fixed-cell horizontal sheet. */
  it('matches PNG geometry to every declared pose and original frame count', () => {
    expect(Object.fromEntries(Object.entries(CHARACTER_SHEETS).map(([pose, sheet]) => [pose, sheet.frames])))
      .toEqual({ run: 8, idle: 12, air: 2, swing: 6, jump: 1, landing: 1, slide: 1 });
    for (const [pose, sheet] of Object.entries(CHARACTER_SHEETS)) {
      const bytes = readFileSync(new URL(`../src/assets/characters/${pose}.png`, import.meta.url));
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(bytes.readUInt32BE(16)).toBe(sheet.width * sheet.frames);
      expect(bytes.readUInt32BE(20)).toBe(sheet.height);
    }
  });

  /** Gold, green, and red variants alter only exact opaque shirt shades. */
  it('preserves skin, outlines and transparent RGB while differentiating the explorers', () => {
    const original = new Uint8ClampedArray([
      110, 192, 155, 255, // Shirt highlight.
      255, 209, 164, 255, // Skin.
      0, 0, 0, 255, // Outline.
      110, 192, 155, 0 // Transparent shirt-like RGB.
    ]);
    const shirts = EXPLORER_IDS.map(explorer => {
      const pixels = original.slice();
      recolorCharacterPixels(pixels, explorer);
      expect(pixels.slice(4)).toEqual(original.slice(4));
      expect(pixels[3]).toBe(255);
      return Array.from(pixels.slice(0, 3));
    });
    expect(shirts).toEqual([[212, 175, 87], [52, 211, 153], [239, 119, 119]]);
  });
});
