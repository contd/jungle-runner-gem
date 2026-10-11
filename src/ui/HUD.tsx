/**
 * Jungle Run - In-Game HUD & Mobile Touch Controls Overlay
 * @module ui/HUD
 */

import React, { useEffect } from 'react';
import { Heart, Coins, Gem, Shield, Magnet, Pause, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import { GameHUDStats } from '../game/scenes/GameScene.ts';
import { GameMode } from '../data/types.ts';
import { InputManager } from '../game/input/InputManager.ts';

/** Active-run telemetry and action callbacks, independent of persistence. */
export interface HUDProps {
  /** Latest scene snapshot containing score, pickups, power-ups, lives, and biome. */
  stats: GameHUDStats;
  /** Practice mode substitutes an infinity label for the three-heart display. */
  gameMode: GameMode;
  /** Already-resolved user preference/device-capability decision for virtual buttons. */
  showTouchControls: boolean;
  /** Logical action bridge used by both touch and mouse button handlers. */
  inputManager: InputManager;
  /** Application-owned transition to pause. */
  onPause: () => void;
}

/**
 * Render telemetry without intercepting the canvas except at interactive controls.
 * Virtual buttons emit paired press/release events; gesture recognition on the
 * underlying game surface is handled separately by InputManager.
 */
export const HUD: React.FC<HUDProps> = ({
  stats,
  gameMode,
  showTouchControls,
  inputManager,
  onPause
}) => {
  useEffect(() => () => {
    inputManager.triggerAction('forward', false);
  }, [inputManager, showTouchControls]);

  /** Translate scene biome keys to player-facing labels, with a generic unknown-key fallback. */
  const getBiomeName = (biome: string) => {
    switch (biome) {
      case 'canopy': return 'Deep Canopy';
      case 'swamp': return 'Crocodile Swamp';
      case 'temple': return 'Ancient Temple';
      case 'cavern': return 'Primeval Cavern';
      default: return 'Jungle Trail';
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between p-3 sm:p-5 z-20">
      {/* Top Header Bar */}
      <div className="flex items-start justify-between w-full">
        {/* Left: Score & Distance & Biome */}
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl sm:text-3xl font-extrabold text-amber-300 drop-shadow-md tracking-wider">
              {stats.score.toLocaleString()}
            </span>
            {stats.multiplier > 1 && (
              <span className="font-body text-xs sm:text-sm font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 animate-pulse">
                {stats.multiplier}x COMBO
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs sm:text-sm text-emerald-200/90 font-medium">
            <span className="font-mono text-emerald-100">{stats.distanceMeters}m</span>
            <span aria-hidden="true" className="text-emerald-500/60">·</span>
            <span className="text-emerald-300/80">{getBiomeName(stats.currentBiome)}</span>
          </div>
        </div>

        {/* Center: Collectibles & Powerups */}
        <div className="flex items-center gap-4 sm:gap-6 bg-emerald-950/70 backdrop-blur-md px-3 sm:px-4 py-1.5 rounded-xl border border-emerald-800/50 shadow-lg pointer-events-auto">
          {/* Coins */}
          <div className="flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="font-mono text-xs sm:text-sm font-semibold text-amber-100">
              {stats.coins}
            </span>
          </div>

          {/* Relics */}
          <div className="flex items-center gap-1.5">
            <Gem className="w-4 h-4 text-emerald-400" />
            <span className="font-mono text-xs sm:text-sm font-semibold text-emerald-100">
              {stats.relics}
            </span>
          </div>

          {/* Active Powerups */}
          {stats.shieldActive && (
            <div className="flex items-center gap-1 text-emerald-300" title="Shield Active">
              <Shield className="w-4 h-4 animate-bounce" />
            </div>
          )}
          {stats.magnetActive && (
            <div className="flex items-center gap-1 text-sky-400" title="Coin Magnet Active">
              <Magnet className="w-4 h-4 animate-spin" />
            </div>
          )}
        </div>

        {/* Right: Lives & Pause */}
        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
          {/* Lives Indicator */}
          <div className="flex items-center gap-1 bg-emerald-950/70 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-emerald-800/50">
            {gameMode === 'practice' ? (
              <span className="text-xs font-bold text-emerald-300 px-1 font-mono">PRACTICE ∞</span>
            ) : (
              Array.from({ length: 3 }).map((_, i) => (
                <Heart
                  key={i}
                  className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors ${
                    i < stats.lives
                      ? 'text-red-500 fill-red-500 drop-shadow'
                      : 'text-stone-600 fill-stone-800'
                  }`}
                />
              ))
            )}
          </div>

          {/* Pause Button */}
          <button
            onClick={onPause}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-900/80 hover:bg-emerald-800 text-emerald-100 flex items-center justify-center border border-emerald-700/60 transition active:scale-95 shadow-md cursor-pointer"
            aria-label="Pause Game"
          >
            <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Bottom: Mobile Touch Controls (When enabled) */}
      {showTouchControls && (
        <div className="w-full flex items-end justify-between pointer-events-auto pb-2 px-1">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              inputManager.triggerAction('forward', true);
            }}
            onPointerUp={() => inputManager.triggerAction('forward', false)}
            onPointerCancel={() => inputManager.triggerAction('forward', false)}
            onLostPointerCapture={() => inputManager.triggerAction('forward', false)}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-emerald-950/80 text-emerald-200 border-2 border-emerald-600/60 active:scale-90 transition-transform flex flex-col items-center justify-center shadow-2xl touch-none cursor-pointer"
            aria-label="Hold to Move Forward"
          >
            <ArrowRight className="w-7 h-7 sm:w-9 sm:h-9" />
            <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase">MOVE</span>
          </button>
          {/* Left Slide / Duck Touch Button */}
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              inputManager.triggerAction('slide', true);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              inputManager.triggerAction('slide', false);
            }}
            onMouseDown={() => inputManager.triggerAction('slide', true)}
            onMouseUp={() => inputManager.triggerAction('slide', false)}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-950/80 hover:bg-amber-900 text-amber-200 border-2 border-amber-600/60 active:scale-90 transition-transform flex flex-col items-center justify-center shadow-2xl touch-manipulation cursor-pointer"
            aria-label="Slide Button"
          >
            <ArrowDown className="w-7 h-7 sm:w-9 sm:h-9" />
            <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase">SLIDE</span>
          </button>

          {/* Right Jump / Vine Swing Touch Button */}
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              inputManager.triggerAction('jump', true);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              inputManager.triggerAction('jump', false);
            }}
            onMouseDown={() => inputManager.triggerAction('jump', true)}
            onMouseUp={() => inputManager.triggerAction('jump', false)}
            className="w-18 h-18 sm:w-22 sm:h-22 rounded-2xl bg-emerald-800/90 hover:bg-emerald-700 text-emerald-100 border-2 border-emerald-400 active:scale-90 transition-transform flex flex-col items-center justify-center shadow-2xl touch-manipulation cursor-pointer"
            aria-label="Jump Button"
          >
            <ArrowUp className="w-8 h-8 sm:w-10 sm:h-10" />
            <span className="text-[10px] sm:text-xs font-extrabold tracking-wider uppercase">JUMP</span>
          </button>
        </div>
      )}
    </div>
  );
};
