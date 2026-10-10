/**
 * Jungle Run - Settings & Data Management Modal
 */

import React, { useState } from 'react';
import { X, Volume2, VolumeX, Smartphone, Monitor, Download, Upload, Trash2, CloudOff, Keyboard } from 'lucide-react';
import { GameSettings } from '../data/types.ts';
import { gameRepository } from '../data/repository.ts';
import { soundManager } from '../game/audio/SoundManager.ts';

interface SettingsModalProps {
  settings: GameSettings;
  onClose: () => void;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onClose,
  onUpdateSettings
}) => {
  const [copiedExport, setCopiedExport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleMusicChange = (val: number) => {
    onUpdateSettings({ musicVolume: val });
    soundManager.setVolumes(val, settings.sfxVolume, settings.isMuted);
  };

  const handleSfxChange = (val: number) => {
    onUpdateSettings({ sfxVolume: val });
    soundManager.setVolumes(settings.musicVolume, val, settings.isMuted);
  };

  const handleMuteToggle = () => {
    const nextMute = !settings.isMuted;
    onUpdateSettings({ isMuted: nextMute });
    soundManager.setVolumes(settings.musicVolume, settings.sfxVolume, nextMute);
  };

  const handleExportData = async () => {
    const json = await gameRepository.exportData();
    try {
      await navigator.clipboard.writeText(json);
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2500);
    } catch {
      // Prompt download
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jungle_run_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImportData = async () => {
    if (!importText.trim()) return;
    const ok = await gameRepository.importData(importText.trim());
    if (ok) {
      setImportStatus('Data successfully restored!');
      setImportText('');
      setTimeout(() => setImportStatus(null), 3000);
    } else {
      setImportStatus('Invalid backup file JSON.');
      setTimeout(() => setImportStatus(null), 3000);
    }
  };

  const handleResetData = async () => {
    if (confirm('Are you sure you want to reset all records, statistics, and unlocked explorers? This cannot be undone.')) {
      await gameRepository.resetAllData();
      alert('Data reset to default.');
    }
  };

  return (
    <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4 z-40 select-none overflow-y-auto">
      <div className="w-full max-w-2xl bg-stone-900 border border-stone-800 rounded-2xl p-5 sm:p-7 shadow-2xl flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-800">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-amber-300">
            Game Settings & Configuration
          </h2>
          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 my-4 flex flex-col gap-6 text-xs text-stone-300">
          {/* Audio Section */}
          <div className="flex flex-col gap-3 bg-stone-950/60 p-4 rounded-xl border border-stone-800">
            <h3 className="text-xs uppercase font-bold tracking-wider text-emerald-400">Audio Management</h3>

            <div className="flex items-center justify-between">
              <span>Jungle Adventure Music</span>
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

            <div className="flex items-center justify-between mt-1">
              <span>Retro Sound Effects</span>
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
              className="mt-2 py-2 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {settings.isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              <span>{settings.isMuted ? 'Muted (Click to Unmute)' : 'Sound Enabled (Click to Mute)'}</span>
            </button>
          </div>

          {/* Gameplay & Visuals */}
          <div className="flex flex-col gap-3 bg-stone-950/60 p-4 rounded-xl border border-stone-800">
            <h3 className="text-xs uppercase font-bold tracking-wider text-emerald-400">Gameplay & FX</h3>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-stone-200">Screen Shake</div>
                <div className="text-[11px] text-stone-500">Camera impact feedback on jumps, hazards, and relics</div>
              </div>
              <input
                type="checkbox"
                checked={settings.screenShake}
                onChange={(e) => onUpdateSettings({ screenShake: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-stone-800">
              <div>
                <div className="font-medium text-stone-200">On-Screen Touch Buttons</div>
                <div className="text-[11px] text-stone-500">Virtual Jump & Slide buttons for touch devices</div>
              </div>
              <select
                value={settings.showTouchControls}
                onChange={(e) => onUpdateSettings({ showTouchControls: e.target.value as any })}
                className="bg-stone-800 border border-stone-700 text-stone-200 rounded-lg px-2.5 py-1 text-xs"
              >
                <option value="auto">Auto (Detect Mobile)</option>
                <option value="always">Always Visible</option>
                <option value="never">Never (Keyboard only)</option>
              </select>
            </div>
          </div>

          {/* Controls Reference */}
          <div className="flex flex-col gap-2.5 bg-stone-950/60 p-4 rounded-xl border border-stone-800">
            <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider">
              <Keyboard className="w-4 h-4" />
              <span>Controls Reference</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-300">
              <div className="bg-stone-900/60 p-2 rounded-lg border border-stone-800">
                <span className="font-mono text-amber-300 font-bold">Space / Up / W</span>
                <div className="text-stone-400 mt-0.5">Jump / Clear pits / Vine swing launch</div>
              </div>
              <div className="bg-stone-900/60 p-2 rounded-lg border border-stone-800">
                <span className="font-mono text-amber-300 font-bold">Down / S</span>
                <div className="text-stone-400 mt-0.5">Slide / Duck under overhead branches</div>
              </div>
              <div className="bg-stone-900/60 p-2 rounded-lg border border-stone-800">
                <span className="font-mono text-amber-300 font-bold">E / Shift</span>
                <div className="text-stone-400 mt-0.5">Latch onto swinging lianas / vines</div>
              </div>
              <div className="bg-stone-900/60 p-2 rounded-lg border border-stone-800">
                <span className="font-mono text-amber-300 font-bold">Esc / P</span>
                <div className="text-stone-400 mt-0.5">Pause or resume expedition</div>
              </div>
            </div>

            <div className="text-[11px] text-stone-400 mt-1">
              <span className="font-semibold text-emerald-300">Mobile Gestures: </span>
              Swipe Up to Jump, Swipe Down to Slide, Tap to Jump or grab vines. Gamepad A/B supported.
            </div>
          </div>

          {/* Data Export / Backup / Recovery */}
          <div className="flex flex-col gap-3 bg-stone-950/60 p-4 rounded-xl border border-stone-800">
            <h3 className="text-xs uppercase font-bold tracking-wider text-emerald-400">Local Data & Backup</h3>
            <p className="text-[11px] text-stone-400">
              All gameplay, personal bests, and statistics are stored locally on your device in IndexedDB.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportData}
                className="px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>{copiedExport ? 'Copied to Clipboard!' : 'Export / Backup Profile'}</span>
              </button>

              <button
                onClick={handleResetData}
                className="px-3 py-2 rounded-lg bg-red-950/50 hover:bg-red-900/50 text-red-300 border border-red-800/40 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset All Records</span>
              </button>
            </div>

            {/* Import box */}
            <div className="mt-2 flex flex-col gap-1.5">
              <textarea
                placeholder="Paste backup JSON here to restore data..."
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={2}
                className="w-full bg-stone-900 border border-stone-800 rounded-lg p-2 text-[11px] font-mono text-stone-200 outline-none"
              />
              {importStatus && <div className="text-xs font-semibold text-emerald-300">{importStatus}</div>}
              {importText.trim() && (
                <button
                  onClick={handleImportData}
                  className="self-start px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-stone-950 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Restore Data</span>
                </button>
              )}
            </div>
          </div>

          {/* Future Cloud Synchronization Architecture Boundary (Section 14) */}
          <div className="flex flex-col gap-2 bg-stone-950/60 p-4 rounded-xl border border-stone-800/80">
            <div className="flex items-center gap-2 text-stone-400 font-bold uppercase tracking-wider text-[11px]">
              <CloudOff className="w-3.5 h-3.5 text-amber-400" />
              <span>Future Cloud Synchronization Architecture</span>
            </div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Jungle Run is built as an uncompromising <strong>local-first game</strong>. All runs, personal bests, and unlocks work entirely offline without requiring user accounts or third-party cloud services.
            </p>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              The data architecture is structured with formal versioned schemas and conflict reconciliation policies (retaining peak personal bests, highest distance, and union of unlocked skins) for seamless multi-device cloud synchronization in a future release.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
