/**
 * Jungle Run - Achievements Modal
 */

import React from 'react';
import { X, Trophy, CheckCircle2, Lock } from 'lucide-react';
import { Achievement } from '../data/types.ts';
import { soundManager } from '../game/audio/SoundManager.ts';

interface AchievementsModalProps {
  achievements: Achievement[];
  onClose: () => void;
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({ achievements, onClose }) => {
  const completedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4 z-40 select-none overflow-y-auto">
      <div className="w-full max-w-2xl bg-stone-900 border border-amber-900/60 rounded-2xl p-5 sm:p-7 shadow-2xl flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-xl sm:text-2xl font-bold text-amber-300">
              Expedition Achievements
            </h2>
          </div>
          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress summary banner */}
        <div className="my-4 p-3 rounded-xl bg-stone-950/70 border border-stone-800 flex items-center justify-between text-xs">
          <span className="text-stone-300 font-medium">Achievements Unlocked</span>
          <span className="font-mono font-bold text-amber-300 text-sm">
            {completedCount} / {achievements.length}
          </span>
        </div>

        {/* Achievements List */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5">
          {achievements.map((ach) => {
            const pct = Math.min(100, Math.round((ach.progress / ach.maxProgress) * 100));

            return (
              <div
                key={ach.id}
                className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
                  ach.unlocked
                    ? 'bg-amber-950/20 border-amber-700/50 text-stone-100'
                    : 'bg-stone-950/40 border-stone-800/80 text-stone-400'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    ach.unlocked
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-stone-800 text-stone-500'
                  }`}
                >
                  {ach.unlocked ? <CheckCircle2 className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm font-bold ${ach.unlocked ? 'text-amber-300' : 'text-stone-300'}`}>
                      {ach.title}
                    </h3>
                    <span className="font-mono text-xs tabular-nums text-stone-400">
                      {ach.progress} / {ach.maxProgress}
                    </span>
                  </div>

                  <p className="text-xs text-stone-400 mt-0.5 mb-2">
                    {ach.description}
                  </p>

                  {/* Progress Bar */}
                  <div className="w-full bg-stone-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        ach.unlocked ? 'bg-amber-400' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
