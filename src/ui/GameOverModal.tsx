/**
 * Jungle Run - Game Over & Run Summary Modal
 */

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { RotateCcw, Home, Trophy, Coins, Gem, Sparkles, Footprints, ShieldAlert } from 'lucide-react';
import { GameOverData } from '../game/scenes/GameScene.ts';
import { soundManager } from '../game/audio/SoundManager.ts';

interface GameOverModalProps {
  data: GameOverData;
  isNewHighScore: boolean;
  isNewLongestDistance: boolean;
  unlockedAchievements: string[];
  unlockedSkins: string[];
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  data,
  isNewHighScore,
  isNewLongestDistance,
  unlockedAchievements,
  unlockedSkins,
  onPlayAgain,
  onMainMenu
}) => {
  useEffect(() => {
    if (isNewHighScore || isNewLongestDistance || unlockedAchievements.length > 0) {
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch (e) {
        // Safe confetti fallback
      }
    }
  }, [isNewHighScore, isNewLongestDistance, unlockedAchievements]);

  const getCauseTitle = (cause: string) => {
    switch (cause) {
      case 'crocodile': return 'Snapping Crocodile Jaws';
      case 'rolling_boulder': return 'Crushed by Ancient Boulder';
      case 'bottomless_pit': return 'Fell into the Bottomless Pit';
      case 'spikes': return 'Impaled by Temple Spikes';
      case 'branch': return 'Struck Low Overhanging Bough';
      case 'snake': return 'Ambushed by Marsh Serpent';
      default: return 'Fallen to Jungle Perils';
    }
  };

  return (
    <div className="absolute inset-0 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4 z-40 select-none overflow-y-auto">
      <div className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center my-auto">
        {/* Banner */}
        <div className="w-12 h-12 rounded-2xl bg-red-950/80 border border-red-700/60 flex items-center justify-center mb-3">
          <ShieldAlert className="w-6 h-6 text-red-400" />
        </div>

        <h2 className="font-display text-2xl sm:text-3xl font-black text-amber-400 tracking-wider">
          EXPEDITION ENDED
        </h2>

        <p className="text-xs text-stone-400 mt-1 mb-4">
          {getCauseTitle(data.causeOfDeath)}
        </p>

        {/* New Record Badges */}
        {(isNewHighScore || isNewLongestDistance) && (
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            {isNewHighScore && (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                NEW HIGH SCORE!
              </span>
            )}
            {isNewLongestDistance && (
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-emerald-400" />
                NEW LONGEST DISTANCE!
              </span>
            )}
          </div>
        )}

        {/* Primary Metric Highlights */}
        <div className="w-full grid grid-cols-2 gap-3 mb-4">
          <div className="bg-stone-950/70 p-3 rounded-xl border border-stone-800/80 flex flex-col items-center">
            <span className="text-[11px] text-stone-400 uppercase font-semibold">Final Score</span>
            <span className="font-display text-2xl font-black text-amber-300 mt-0.5">
              {data.score.toLocaleString()}
            </span>
          </div>

          <div className="bg-stone-950/70 p-3 rounded-xl border border-stone-800/80 flex flex-col items-center">
            <span className="text-[11px] text-stone-400 uppercase font-semibold">Distance</span>
            <span className="font-mono text-2xl font-black text-emerald-300 mt-0.5">
              {data.distanceMeters}m
            </span>
          </div>
        </div>

        {/* Expedition Breakdown */}
        <div className="w-full bg-stone-950/50 rounded-xl p-3 border border-stone-800/60 mb-5 flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between text-stone-300">
            <span className="flex items-center gap-1.5 text-stone-400">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              Gold Coins Collected
            </span>
            <span className="font-mono font-semibold text-amber-200">{data.coins}</span>
          </div>

          <div className="flex items-center justify-between text-stone-300">
            <span className="flex items-center gap-1.5 text-stone-400">
              <Gem className="w-3.5 h-3.5 text-emerald-400" />
              Golden Relics Recovered
            </span>
            <span className="font-mono font-semibold text-emerald-200">{data.relics}</span>
          </div>

          <div className="flex items-center justify-between text-stone-300">
            <span className="text-stone-400">Vines Swung Across</span>
            <span className="font-mono font-semibold text-stone-200">{data.vinesSwung}</span>
          </div>

          <div className="flex items-center justify-between text-stone-300">
            <span className="text-stone-400">Hazards Cleared</span>
            <span className="font-mono font-semibold text-stone-200">{data.hazardsAvoided}</span>
          </div>
        </div>

        {/* Unlocked Achievements / Skins alerts */}
        {unlockedAchievements.length > 0 && (
          <div className="w-full bg-amber-950/40 border border-amber-600/40 rounded-xl p-2.5 mb-4 text-xs text-amber-200">
            <div className="font-bold flex items-center justify-center gap-1 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Achievements Unlocked!
            </div>
            {unlockedAchievements.map((ach, idx) => (
              <div key={idx} className="text-[11px] text-amber-300">· {ach}</div>
            ))}
          </div>
        )}

        {unlockedSkins.length > 0 && (
          <div className="w-full bg-emerald-950/40 border border-emerald-600/40 rounded-xl p-2.5 mb-4 text-xs text-emerald-200">
            <div className="font-bold flex items-center justify-center gap-1 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              New Explorer Unlocked!
            </div>
            {unlockedSkins.map((skin, idx) => (
              <div key={idx} className="text-[11px] text-emerald-300">· {skin}</div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full flex flex-col gap-2.5">
          <button
            onClick={() => { soundManager.playClick(); onPlayAgain(); }}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-stone-950 font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-xl active:scale-95 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 fill-stone-950" />
            PLAY AGAIN
          </button>

          <button
            onClick={() => { soundManager.playClick(); onMainMenu(); }}
            className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-stone-100 font-medium text-xs flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Return to Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};
