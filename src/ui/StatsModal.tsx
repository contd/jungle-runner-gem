/**
 * Jungle Run - Statistics & Career Records Modal
 * @module ui/StatsModal
 */

import React from 'react';
import { X, Trophy, Footprints, Coins, Gem, Compass, History, Shield } from 'lucide-react';
import { LocalProfile } from '../data/types.ts';
import { soundManager } from '../game/audio/SoundManager.ts';

/** Read-only career aggregate and dismissal callback. */
export interface StatsModalProps {
  /** Lifetime totals plus newest-first completed-run history. */
  profile: LocalProfile;
  /** Dismiss the overlay without changing persisted data. */
  onClose: () => void;
}

/**
 * Present lifetime counters and at most fifteen recent expeditions.
 * Dates/numbers use browser locale formatting; history remains in repository order.
 * This is a presentation subset of the 30-run recording/50-run loading limits.
 */
export const StatsModal: React.FC<StatsModalProps> = ({ profile, onClose }) => {
  /** Shared statistics aggregate, used read-only by this component. */
  const stats = profile.stats;

  return (
    <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4 z-40 select-none overflow-y-auto">
      <div className="w-full max-w-2xl bg-stone-900 border border-emerald-900/60 rounded-2xl p-5 sm:p-7 shadow-2xl flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-emerald-400" />
            <h2 className="font-display text-xl sm:text-2xl font-bold text-amber-300">
              Explorer Logbook & Records
            </h2>
          </div>
          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lifetime Career KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
          <div className="bg-stone-950/70 p-3 rounded-xl border border-stone-800 flex flex-col">
            <span className="text-[11px] text-stone-400 font-medium">High Score</span>
            <span className="font-display text-lg font-black text-amber-300 mt-1 tabular-nums">
              {stats.highScore.toLocaleString()}
            </span>
          </div>

          <div className="bg-stone-950/70 p-3 rounded-xl border border-stone-800 flex flex-col">
            <span className="text-[11px] text-stone-400 font-medium">Longest Run</span>
            <span className="font-mono text-lg font-bold text-emerald-300 mt-1 tabular-nums">
              {stats.longestDistanceMeters}m
            </span>
          </div>

          <div className="bg-stone-950/70 p-3 rounded-xl border border-stone-800 flex flex-col">
            <span className="text-[11px] text-stone-400 font-medium">Total Distance</span>
            <span className="font-mono text-lg font-bold text-stone-200 mt-1 tabular-nums">
              {stats.totalDistanceMeters.toLocaleString()}m
            </span>
          </div>

          <div className="bg-stone-950/70 p-3 rounded-xl border border-stone-800 flex flex-col">
            <span className="text-[11px] text-stone-400 font-medium">Expeditions</span>
            <span className="font-mono text-lg font-bold text-stone-200 mt-1 tabular-nums">
              {stats.totalRuns}
            </span>
          </div>

          <div className="bg-stone-950/70 p-3 rounded-xl border border-stone-800 flex flex-col">
            <span className="text-[11px] text-stone-400 font-medium flex items-center gap-1">
              <Coins className="w-3 h-3 text-amber-400" /> Total Gold
            </span>
            <span className="font-mono text-lg font-bold text-amber-300 mt-1 tabular-nums">
              {stats.totalCoins}
            </span>
          </div>

          <div className="bg-stone-950/70 p-3 rounded-xl border border-stone-800 flex flex-col">
            <span className="text-[11px] text-stone-400 font-medium flex items-center gap-1">
              <Gem className="w-3 h-3 text-emerald-400" /> Relics Found
            </span>
            <span className="font-mono text-lg font-bold text-emerald-300 mt-1 tabular-nums">
              {stats.totalRelics}
            </span>
          </div>

          <div className="bg-stone-950/70 p-3 rounded-xl border border-stone-800 flex flex-col">
            <span className="text-[11px] text-stone-400 font-medium">Most Vines (1 Run)</span>
            <span className="font-mono text-lg font-bold text-stone-200 mt-1 tabular-nums">
              {stats.mostVinesSwungInSingleRun}
            </span>
          </div>

          <div className="bg-stone-950/70 p-3 rounded-xl border border-stone-800 flex flex-col">
            <span className="text-[11px] text-stone-400 font-medium">Hazards Dodged</span>
            <span className="font-mono text-lg font-bold text-stone-200 mt-1 tabular-nums">
              {stats.totalHazardsAvoided}
            </span>
          </div>
        </div>

        {/* Recent Runs Table */}
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-stone-300">
          <History className="w-4 h-4 text-emerald-400" />
          <span>Recent Expeditions</span>
        </div>

        <div className="flex-1 overflow-y-auto border border-stone-800 rounded-xl bg-stone-950/50">
          {profile.recentRuns.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-500">
              No expeditions logged yet. Embark on your first adventure!
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-900/90 text-stone-400 border-b border-stone-800 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Date</th>
                  <th className="py-2.5 px-3 font-medium text-right">Score</th>
                  <th className="py-2.5 px-3 font-medium text-right">Distance</th>
                  <th className="py-2.5 px-3 font-medium text-right">Coins</th>
                  <th className="py-2.5 px-3 font-medium">Cause</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60">
                {profile.recentRuns.slice(0, 15).map((run) => (
                  <tr key={run.id} className="hover:bg-stone-900/40">
                    <td className="py-2 px-3 text-stone-400 whitespace-nowrap">
                      {new Date(run.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-amber-300 text-right tabular-nums">
                      {run.score.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 font-mono text-emerald-300 text-right tabular-nums">
                      {run.distanceMeters}m
                    </td>
                    <td className="py-2 px-3 font-mono text-stone-300 text-right tabular-nums">
                      {run.coinsCollected}
                    </td>
                    <td className="py-2 px-3 text-stone-400 capitalize truncate max-w-[120px]">
                      {run.causeOfDeath.replace('_', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
