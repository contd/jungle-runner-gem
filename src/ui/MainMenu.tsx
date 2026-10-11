/**
 * Jungle Run - Main Menu
 * Heroic adventure title, mode selector, character selector, and menu navigation.
 * @module ui/MainMenu
 */

import React, { useState } from 'react';
import { Play, Trophy, BarChart3, Settings as SettingsIcon, Info, Sparkles, Lock, Shuffle, Compass } from 'lucide-react';
import { LocalProfile, GameMode } from '../data/types.ts';
import { soundManager } from '../game/audio/SoundManager.ts';
import splashHeroImg from '../assets/images/jungle_run_splash_hero_1791667978761.jpg';

/** Read-only progression plus navigation/start callbacks owned by the application shell. */
export interface MainMenuProps {
  /** Profile snapshot supplying records, available skins, and the initial explorer choice. */
  profile: LocalProfile;
  /** Start with selected rules/explorer and an optional parsed challenge seed. */
  onStartGame: (mode: GameMode, characterId: string, customSeed?: number) => void;
  /** Open the achievement overlay without leaving the menu screen. */
  onOpenAchievements: () => void;
  /** Open the lifetime statistics/history overlay. */
  onOpenStats: () => void;
  /** Open audio, presentation, and backup controls. */
  onOpenSettings: () => void;
  /** Open engine/asset attribution. */
  onOpenCredits: () => void;
}

/**
 * Configure an expedition and navigate auxiliary menu overlays.
 * Explorer selection is local to the menu and is passed to start; it does not call
 * the repository's preferred-character persistence method.
 */
export const MainMenu: React.FC<MainMenuProps> = ({
  profile,
  onStartGame,
  onOpenAchievements,
  onOpenStats,
  onOpenSettings,
  onOpenCredits
}) => {
  /** Pending mode choice, defaulting to the normal three-life expedition. */
  const [selectedMode, setSelectedMode] = useState<GameMode>('endless');
  /** Pending explorer choice initialized from the profile at mount time. */
  const [selectedChar, setSelectedChar] = useState<string>(profile.selectedCharacterId || 'harry');
  /** Raw seed input retained as text so empty input can request a random seed. */
  const [customSeedInput, setCustomSeedInput] = useState<string>('');

  /** Parse nonempty challenge input in base ten; invalid/absent values leave the seed unspecified. */
  const handleStart = () => {
    soundManager.playClick();
    /** Undefined requests randomization by the application shell rather than a fixed seed. */
    let seed: number | undefined = undefined;
    if (selectedMode === 'challenge' && customSeedInput.trim()) {
      const parsed = parseInt(customSeedInput.trim(), 10);
      if (!isNaN(parsed)) seed = parsed;
    }
    onStartGame(selectedMode, selectedChar, seed);
  };

  /** Accept only unlocked menu entries and play selection feedback. */
  const handleCharSelect = (charId: string, unlocked: boolean) => {
    if (!unlocked) return;
    soundManager.playClick();
    setSelectedChar(charId);
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between p-4 sm:p-6 overflow-y-auto bg-stone-950 text-stone-100">
      {/* Background Hero Banner with Dark Contrast Gradient */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <img
          src={splashHeroImg}
          alt="Jungle Run Adventure"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center opacity-40 scale-105 filter blur-[1px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/80 to-stone-950/40" />
      </div>

      {/* Top Bar / Records Summary */}
      <div className="relative z-10 w-full max-w-4xl flex items-center justify-between border-b border-emerald-900/40 pb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-semibold tracking-wider text-emerald-300 uppercase">
            Jungle Run
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-stone-300">
          <div>
            <span className="text-stone-400">Best Score: </span>
            <span className="font-mono font-bold text-amber-300 tabular-nums">
              {profile.stats.highScore.toLocaleString()}
            </span>
          </div>
          <span aria-hidden="true" className="text-stone-600">·</span>
          <div>
            <span className="text-stone-400">Longest: </span>
            <span className="font-mono font-bold text-emerald-300 tabular-nums">
              {profile.stats.longestDistanceMeters}m
            </span>
          </div>
        </div>
      </div>

      {/* Center: Title & Adventure Configuration */}
      <div className="relative z-10 w-full max-w-4xl my-auto py-4 flex flex-col items-center text-center">
        {/* Game Title */}
        <h1 className="font-display text-4xl sm:text-6xl font-black tracking-wider text-amber-400 drop-shadow-xl retro-glow-gold">
          JUNGLE RUN
        </h1>
        <p className="font-body text-sm sm:text-base text-emerald-200/90 max-w-lg mt-1 mb-6 font-medium">
          Swing across treacherous chasms, dodge snapping crocodiles, leap rolling boulders, and claim ancient relics.
        </p>

        {/* Mode Selector */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
          <button
            onClick={() => { soundManager.playClick(); setSelectedMode('endless'); }}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
              selectedMode === 'endless'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-950'
                : 'bg-emerald-950/60 text-emerald-200 border-emerald-900/60 hover:bg-emerald-900/60'
            }`}
          >
            Endless Adventure
          </button>

          <button
            onClick={() => { soundManager.playClick(); setSelectedMode('practice'); }}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
              selectedMode === 'practice'
                ? 'bg-amber-600 text-white border-amber-400 shadow-lg shadow-amber-950'
                : 'bg-emerald-950/60 text-emerald-200 border-emerald-900/60 hover:bg-emerald-900/60'
            }`}
          >
            Practice Sanctuary (Infinite Lives)
          </button>

          <button
            onClick={() => { soundManager.playClick(); setSelectedMode('challenge'); }}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
              selectedMode === 'challenge'
                ? 'bg-sky-600 text-white border-sky-400 shadow-lg shadow-sky-950'
                : 'bg-emerald-950/60 text-emerald-200 border-emerald-900/60 hover:bg-emerald-900/60'
            }`}
          >
            Seeded Expedition
          </button>
        </div>

        {/* Optional Custom Seed Input for Challenge Mode */}
        {selectedMode === 'challenge' && (
          <div className="mb-5 flex items-center gap-2 bg-stone-900/90 border border-sky-500/50 px-3 py-1.5 rounded-lg max-w-xs w-full">
            <Shuffle className="w-4 h-4 text-sky-400 shrink-0" />
            <input
              type="number"
              placeholder="Custom Seed (e.g. 42890)"
              value={customSeedInput}
              onChange={(e) => setCustomSeedInput(e.target.value)}
              className="bg-transparent text-xs text-stone-100 placeholder-stone-500 outline-none w-full font-mono"
            />
          </div>
        )}

        {/* Character Skin Selection */}
        <div className="w-full max-w-xl mb-6">
          <div className="text-xs uppercase font-semibold text-stone-400 mb-2">Select Your Adventurer</div>
          <div className="grid grid-cols-3 gap-3">
            {profile.unlockedSkins.map((skin) => {
              const isSelected = selectedChar === skin.id;
              return (
                <button
                  key={skin.id}
                  onClick={() => handleCharSelect(skin.id, skin.unlocked)}
                  className={`relative p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-emerald-900/80 border-emerald-400 shadow-md ring-2 ring-emerald-500/40'
                      : skin.unlocked
                      ? 'bg-stone-900/70 border-stone-700/60 hover:border-emerald-600/60'
                      : 'bg-stone-900/40 border-stone-800 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs sm:text-sm font-bold text-stone-100 truncate">{skin.name}</span>
                    {!skin.unlocked && <Lock className="w-3.5 h-3.5 text-stone-500 shrink-0" />}
                  </div>
                  <div className="text-[11px] text-stone-400 line-clamp-1">
                    {skin.unlocked ? skin.title : skin.unlockRequirement}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Action Button: Start Run */}
        <button
          onClick={handleStart}
          className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-display font-extrabold text-lg sm:text-xl tracking-wider shadow-xl shadow-amber-900/30 active:scale-95 transition-all flex items-center gap-3 cursor-pointer"
        >
          <Play className="w-6 h-6 fill-stone-950" />
          START ADVENTURE
        </button>
      </div>

      {/* Bottom Menu Navigation Bar */}
      <div className="relative z-10 w-full max-w-2xl flex items-center justify-center gap-3 sm:gap-6 pt-3 border-t border-emerald-900/30">
        <button
          onClick={() => { soundManager.playClick(); onOpenAchievements(); }}
          className="flex items-center gap-1.5 text-xs sm:text-sm text-stone-300 hover:text-amber-300 transition py-1 px-2 rounded cursor-pointer"
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Achievements</span>
        </button>

        <span aria-hidden="true" className="text-stone-700">·</span>

        <button
          onClick={() => { soundManager.playClick(); onOpenStats(); }}
          className="flex items-center gap-1.5 text-xs sm:text-sm text-stone-300 hover:text-emerald-300 transition py-1 px-2 rounded cursor-pointer"
        >
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <span>Statistics</span>
        </button>

        <span aria-hidden="true" className="text-stone-700">·</span>

        <button
          onClick={() => { soundManager.playClick(); onOpenSettings(); }}
          className="flex items-center gap-1.5 text-xs sm:text-sm text-stone-300 hover:text-stone-100 transition py-1 px-2 rounded cursor-pointer"
        >
          <SettingsIcon className="w-4 h-4 text-stone-400" />
          <span>Settings</span>
        </button>

        <span aria-hidden="true" className="text-stone-700">·</span>

        <button
          onClick={() => { soundManager.playClick(); onOpenCredits(); }}
          className="flex items-center gap-1.5 text-xs sm:text-sm text-stone-300 hover:text-stone-100 transition py-1 px-2 rounded cursor-pointer"
        >
          <Info className="w-4 h-4 text-stone-400" />
          <span>Credits</span>
        </button>
      </div>
    </div>
  );
};
