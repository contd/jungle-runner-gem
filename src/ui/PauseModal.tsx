/**
 * Jungle Run - Pause Modal
 * @module ui/PauseModal
 */

import React from 'react';
import { Play, RotateCcw, Home, Volume2, VolumeX } from 'lucide-react';
import { soundManager } from '../game/audio/SoundManager.ts';
import { GameSettings } from '../data/types.ts';

/** Controlled pause actions and live audio preferences. */
export interface PauseModalProps {
  /** Current audio preferences shared with the full settings overlay. */
  settings: GameSettings;
  /** Resume the existing run rather than replace its engine instance. */
  onResume: () => void;
  /** Abandon this run and start a freshly seeded session. */
  onRestart: () => void;
  /** Return to the main menu without recording the unfinished run. */
  onQuit: () => void;
  /** Request a persisted shallow preference change. */
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
}

/** Present pause navigation and immediate audio controls; the parent actually pauses Phaser. */
export const PauseModal: React.FC<PauseModalProps> = ({
  settings,
  onResume,
  onRestart,
  onQuit,
  onUpdateSettings
}) => {
  /** Persist the music gain preference and update the live attenuated music bus. */
  const handleMusicChange = (val: number) => {
    onUpdateSettings({ musicVolume: val });
    soundManager.setVolumes(val, settings.sfxVolume, settings.isMuted);
  };

  /** Persist the effect gain preference and update the live effect bus. */
  const handleSfxChange = (val: number) => {
    onUpdateSettings({ sfxVolume: val });
    soundManager.setVolumes(settings.musicVolume, val, settings.isMuted);
  };

  /** Invert master mute while retaining the separate bus-volume preferences. */
  const handleMuteToggle = () => {
    const nextMute = !settings.isMuted;
    onUpdateSettings({ isMuted: nextMute });
    soundManager.setVolumes(settings.musicVolume, settings.sfxVolume, nextMute);
  };

  return (
    <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-40 select-none">
      <div className="w-full max-w-sm bg-stone-900 border border-emerald-800/80 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center">
        <h2 className="font-display text-2xl font-black text-amber-400 mb-1 tracking-wider">
          GAME PAUSED
        </h2>
        <p className="text-xs text-stone-400 mb-6">Take a breath in the jungle canopy</p>

        {/* Quick Audio Controls */}
        <div className="w-full bg-stone-950/60 rounded-xl p-3 border border-stone-800 mb-6 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-stone-300">
            <span>Music Volume</span>
            <span className="font-mono">{Math.round(settings.musicVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.musicVolume}
            onChange={(e) => handleMusicChange(parseFloat(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer"
          />

          <div className="flex items-center justify-between text-xs text-stone-300 mt-1">
            <span>SFX Volume</span>
            <span className="font-mono">{Math.round(settings.sfxVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.sfxVolume}
            onChange={(e) => handleSfxChange(parseFloat(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer"
          />

          <button
            onClick={handleMuteToggle}
            className="mt-1 flex items-center justify-center gap-2 text-xs py-1.5 px-3 rounded-lg bg-stone-800/60 hover:bg-stone-800 text-stone-300 transition"
          >
            {settings.isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span>{settings.isMuted ? 'Unmute Audio' : 'Mute All Audio'}</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex flex-col gap-2.5">
          <button
            onClick={() => { soundManager.playClick(); onResume(); }}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-stone-950" />
            Resume Adventure
          </button>

          <button
            onClick={() => { soundManager.playClick(); onRestart(); }}
            className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-xs flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            Restart Run
          </button>

          <button
            onClick={() => { soundManager.playClick(); onQuit(); }}
            className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 font-medium text-xs flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};
