/**
 * Jungle Run - Credits & Asset Attribution Manifest
 * @module ui/CreditsModal
 */

import React from 'react';
import { X, Heart, ShieldCheck, Sparkles } from 'lucide-react';
import { soundManager } from '../game/audio/SoundManager.ts';

/** Navigation boundary for the static attribution overlay. */
export interface CreditsModalProps {
  /** Dismiss the overlay after optional click feedback. */
  onClose: () => void;
}

/** Present original-game inspiration, engine licenses, and locally generated asset attribution. */
export const CreditsModal: React.FC<CreditsModalProps> = ({ onClose }) => {
  return (
    <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4 z-40 select-none overflow-y-auto">
      <div className="w-full max-w-xl bg-stone-900 border border-emerald-900/60 rounded-2xl p-5 sm:p-7 shadow-2xl flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-xl sm:text-2xl font-bold text-amber-300">
              Credits & Asset Attribution
            </h2>
          </div>
          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-1 my-4 flex flex-col gap-4 text-xs text-stone-300 leading-relaxed">
          <div className="bg-stone-950/60 p-4 rounded-xl border border-stone-800">
            <h3 className="text-amber-400 font-bold mb-1 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
              Tribute to a Video Game Pioneer
            </h3>
            <p className="text-stone-300">
              <strong>Jungle Run</strong> is inspired by the iconic 1982 Atari 2600 masterpiece <em>Pitfall!</em> designed by David Crane. It celebrates the thrill of swinging across chasms on jungle vines, timing leaps across snapping crocodiles, and leaping over rolling logs in a dangerous tropical expedition.
            </p>
          </div>

          <div className="bg-stone-950/60 p-4 rounded-xl border border-stone-800 flex flex-col gap-2">
            <h3 className="text-emerald-400 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Asset & Engine Attribution Manifest
            </h3>

            <div className="border-t border-stone-800/80 pt-2 flex flex-col gap-2">
              <div>
                <span className="font-semibold text-stone-200">Phaser 3 Game Engine: </span>
                <span className="text-stone-400">Created by Richard Davey & Photon Storm Ltd. Licensed under the MIT License.</span>
              </div>

              <div>
                <span className="font-semibold text-stone-200">Tauri v2 Native Shell: </span>
                <span className="text-stone-400">Engineered by the Tauri Programme. Licensed under MIT / Apache-2.0.</span>
              </div>

              <div>
                <span className="font-semibold text-stone-200">Sprites & Visual Assets: </span>
                <span className="text-stone-400">Procedural 2D pixel animations synthesized via HTML5 Canvas API in BootScene + locally bundled thematic environment textures.</span>
              </div>

              <div>
                <span className="font-semibold text-stone-200">Procedural Audio: </span>
                <span className="text-stone-400">Real-time Web Audio API chiptune synthesizer and ambient jungle scales. 100% offline, zero external streaming dependencies.</span>
              </div>

              <div>
                <span className="font-semibold text-stone-200">UI Icons: </span>
                <span className="text-stone-400">Lucide Icons. Licensed under the ISC License.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-stone-800 flex justify-end">
          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-bold text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
