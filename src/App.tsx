/**
 * Jungle Run - Main React Application Shell
 * State machine managing MainMenu, Active Phaser Gameplay, HUD, Pause, GameOver,
 * and Modals.
 * @module App
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LocalProfile, GameMode, GameSettings } from './data/types.ts';
import { gameRepository } from './data/repository.ts';
import { createDefaultProfile } from './data/defaults.ts';
import { InputManager } from './game/input/InputManager.ts';
import { soundManager } from './game/audio/SoundManager.ts';
import { PhaserGame } from './game/PhaserGame.tsx';
import { HUD } from './ui/HUD.tsx';
import { MainMenu } from './ui/MainMenu.tsx';
import { PauseModal } from './ui/PauseModal.tsx';
import { GameOverModal } from './ui/GameOverModal.tsx';
import { StatsModal } from './ui/StatsModal.tsx';
import { AchievementsModal } from './ui/AchievementsModal.tsx';
import { SettingsModal } from './ui/SettingsModal.tsx';
import { CreditsModal } from './ui/CreditsModal.tsx';
import { GameHUDStats, GameOverData } from './game/scenes/GameScene.ts';

/** Top-level screen state; gameplay remains mounted through pause and result overlays. */
export type AppScreen = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';
/** Independent menu overlay state; null means no secondary modal is open. */
export type ModalType = 'achievements' | 'stats' | 'settings' | 'credits' | null;

/**
 * Coordinate the local profile, run configuration, engine lifecycle, and menu overlays.
 * A session key forces a fresh Phaser mount on restart even if other options match.
 * Final scene results are recorded before showing the result overlay; aborted runs
 * returned to the menu are not recorded by that transition.
 */
export default function App() {
  /** Defaults render immediately while the persisted aggregate loads asynchronously. */
  const [profile, setProfile] = useState<LocalProfile>(() => createDefaultProfile());
  /** Gate gameplay until native loading/migration succeeds, so defaults cannot hide a failed save. */
  const [profileReady, setProfileReady] = useState(false);
  /** Explicit persistence/IPC failure, retained until retry or user dismissal. */
  const [dataError, setDataError] = useState<string | null>(null);
  /** Retry trigger for failed initial native loading or legacy migration. */
  const [loadAttempt, setLoadAttempt] = useState(0);
  /** Unsaved terminal result retained for retry without discarding the completed expedition. */
  const [unsavedRun, setUnsavedRun] = useState<GameOverData | null>(null);
  /** Synchronous guard prevents double-clicked retry requests from recording a run twice. */
  const savingRun = useRef(false);
  /** UI feedback/disable state while a terminal result is being persisted. */
  const [isSavingRun, setIsSavingRun] = useState(false);
  /** Screen-state owner for game mounting and pause control. */
  const [screen, setScreen] = useState<AppScreen>('MENU');
  /** Menu modal selection, separate from the active-run state machine. */
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // Active Run Configuration
  /** Rules selected for the current expedition. */
  const [currentMode, setCurrentMode] = useState<GameMode>('endless');
  /** Explorer selected for the run; used when recording completion. */
  const [currentCharacterId, setCurrentCharacterId] = useState<string>('harry');
  /** Requested seed supplied to Phaser and persisted by the completion handler. */
  const [currentRunSeed, setCurrentRunSeed] = useState<number>(1337);
  /** React remount counter ensuring retries construct an independent engine instance. */
  const [runSessionKey, setRunSessionKey] = useState<number>(1);

  // Live HUD telemetry
  /** Latest active-frame snapshot from GameScene. */
  const [hudStats, setHudStats] = useState<GameHUDStats>({
    score: 0,
    distanceMeters: 0,
    coins: 0,
    relics: 0,
    multiplier: 1,
    lives: 3,
    shieldActive: false,
    magnetActive: false,
    currentBiome: 'canopy'
  });

  // Game Over Details
  /** Scene result combined with repository-computed personal bests and unlock notifications. */
  const [gameOverResult, setGameOverResult] = useState<{
    /** Raw completion snapshot reported by Phaser. */
    data: GameOverData;
    /** Whether recording this result raised the lifetime high score. */
    isNewHighScore: boolean;
    /** Whether recording this result raised the lifetime longest run. */
    isNewLongestDistance: boolean;
    /** Newly completed achievement titles. */
    unlockedAchievements: string[];
    /** Newly selectable explorer names. */
    unlockedSkins: string[];
  } | null>(null);

  // Initialize Input Manager once
  /** Single input instance reused across runs; bindings are replaced after profile loading. */
  const inputManager = useMemo(() => {
    return new InputManager(profile.settings.keyBindings);
  }, []);

  // Load and subscribe to Repository Profile
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    gameRepository.getProfile().then((loadedProfile) => {
      if (cancelled) return;
      setProfile(loadedProfile);
      setProfileReady(true);
      setDataError(null);
      setCurrentCharacterId(loadedProfile.selectedCharacterId || 'harry');
      soundManager.setVolumes(
        loadedProfile.settings.musicVolume,
        loadedProfile.settings.sfxVolume,
        loadedProfile.settings.isMuted
      );
      inputManager.updateBindings(loadedProfile.settings.keyBindings);

      unsubscribe = gameRepository.subscribe((updated) => {
        setProfile(updated);
        inputManager.updateBindings(updated.settings.keyBindings);
        soundManager.setVolumes(updated.settings.musicVolume, updated.settings.sfxVolume, updated.settings.isMuted);
      });
    }).catch((error) => {
      if (cancelled) return;
      console.error('Profile loading failed:', error);
      setDataError(String(error));
    });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [inputManager, loadAttempt]);

  // Hook pause input
  useEffect(() => {
    const unsub = inputManager.onAction('pause', (pressed) => {
      if (pressed) {
        if (screen === 'PLAYING') {
          soundManager.playClick();
          setScreen('PAUSED');
        } else if (screen === 'PAUSED') {
          soundManager.playClick();
          setScreen('PLAYING');
        }
      }
    });

    return unsub;
  }, [screen, inputManager]);

  // Determine touch controls visibility
  /** Resolve the persisted visibility override before browser touch-capability detection. */
  const showTouchControls = useMemo(() => {
    const pref = profile.settings.showTouchControls;
    if (pref === 'always') return true;
    if (pref === 'never') return false;
    // 'auto'
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, [profile.settings.showTouchControls]);

  // Handlers
  /**
   * Apply menu options and start a fresh session; omitted seeds are randomized.
   * @param mode - Life/fall rules selected in the menu.
   * @param characterId - Menu-validated unlocked explorer.
   * @param customSeed - Optional parsed challenge seed, including zero if supplied.
   */
  const handleStartGame = (mode: GameMode, characterId: string, customSeed?: number) => {
    setCurrentMode(mode);
    setCurrentCharacterId(characterId);
    setCurrentRunSeed(customSeed !== undefined ? customSeed : Math.floor(Math.random() * 1000000));
    setRunSessionKey(prev => prev + 1);
    setGameOverResult(null);
    setScreen('PLAYING');
  };

  /** Show the pause overlay without unmounting the active engine. */
  const handlePause = () => {
    soundManager.playClick();
    setScreen('PAUSED');
  };

  /** Return to play so the bridge resumes the existing scene. */
  const handleResume = () => {
    soundManager.playClick();
    setScreen('PLAYING');
  };

  /** Replace the engine session with a fresh random seed, retaining mode and explorer. */
  const handleRestart = () => {
    soundManager.playClick();
    setCurrentRunSeed(Math.floor(Math.random() * 1000000));
    setRunSessionKey(prev => prev + 1);
    setGameOverResult(null);
    setScreen('PLAYING');
  };

  /** Stop future music scheduling and unmount gameplay; this does not record an unfinished run. */
  const handleQuitToMenu = () => {
    soundManager.playClick();
    soundManager.stopMusic();
    setScreen('MENU');
  };

  /**
   * Record final telemetry plus React-owned run options and display progression outcomes.
   * The requested React seed is persisted here; a falsy seed may have been replaced
   * inside the scene. Failed native writes retain the terminal result for an explicit retry.
   */
  const handleGameOver = async (data: GameOverData) => {
    if (savingRun.current) return;
    savingRun.current = true;
    setIsSavingRun(true);
    try {
      const recordOutcome = await gameRepository.recordRun({
        score: data.score,
        distanceMeters: data.distanceMeters,
        coinsCollected: data.coins,
        relicsCollected: data.relics,
        hazardsAvoided: data.hazardsAvoided,
        vinesSwung: data.vinesSwung,
        causeOfDeath: data.causeOfDeath,
        characterId: currentCharacterId,
        seed: currentRunSeed,
        mode: currentMode
      });

      setGameOverResult({
        data,
        isNewHighScore: recordOutcome.newHighScore,
        isNewLongestDistance: recordOutcome.newLongestDistance,
        unlockedAchievements: recordOutcome.unlockedAchievements,
        unlockedSkins: recordOutcome.unlockedSkins
      });
      setUnsavedRun(null);
      setDataError(null);
    } catch (error) {
      console.error('Completed run could not be saved:', error);
      setUnsavedRun(data);
      setDataError(String(error));
    } finally {
      savingRun.current = false;
      setIsSavingRun(false);
    }

    setScreen('GAMEOVER');
  };

  /** Forward shallow preference changes; audio controls apply live mixer updates separately. */
  const handleUpdateSettings = (partial: Partial<GameSettings>) => {
    gameRepository.updateSettings(partial).catch((error) => {
      console.error('Settings could not be saved:', error);
      setDataError(String(error));
      const settings = profile.settings;
      soundManager.setVolumes(settings.musicVolume, settings.sfxVolume, settings.isMuted);
    });
  };

  if (!profileReady) {
    return (
      <div className="w-screen h-screen bg-stone-950 text-stone-200 flex items-center justify-center p-6">
        <div className="max-w-lg text-center" role={dataError ? 'alert' : 'status'}>
          <h1 className="font-display text-2xl text-amber-300 mb-3">Jungle Run</h1>
          <p>{dataError ? 'Your profile could not be loaded. No saved data has been replaced.' : 'Loading your local profile...'}</p>
          {dataError && <>
            <p className="text-sm text-red-300 my-4">{dataError}</p>
            <button className="bg-emerald-700 px-4 py-2 rounded-lg" onClick={() => {
              setDataError(null);
              setLoadAttempt(attempt => attempt + 1);
            }}>Retry profile loading</button>
          </>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-stone-950 font-body select-none">
      {dataError && !unsavedRun && (
        <div role="alert" className="absolute top-0 inset-x-0 z-50 p-3 bg-red-950 text-red-200 text-sm">
          Profile change could not be saved: {dataError}
          <button className="ml-3 underline" onClick={() => setDataError(null)}>Dismiss</button>
        </div>
      )}
      {unsavedRun && (
        <div role="alert" className="absolute inset-0 z-50 bg-stone-950/95 text-stone-200 flex items-center justify-center p-6">
          <div className="max-w-lg text-center">
            <h2 className="text-xl text-amber-300 mb-3">Expedition completed, but not saved</h2>
            <p>Score: {unsavedRun.score.toLocaleString()} / Distance: {unsavedRun.distanceMeters}m</p>
            <p className="text-sm text-red-300 my-4">{dataError}</p>
            <button disabled={isSavingRun} className="bg-emerald-700 px-4 py-2 rounded-lg" onClick={() => handleGameOver(unsavedRun)}>{isSavingRun ? 'Saving...' : 'Retry saving this run'}</button>
            <button disabled={isSavingRun} className="ml-3 underline" onClick={() => {
              setUnsavedRun(null);
              setDataError(null);
              handleQuitToMenu();
            }}>Discard and return to menu</button>
          </div>
        </div>
      )}
      {/* Active Phaser Canvas Viewport (Mounted when PLAYING, PAUSED, or GAMEOVER) */}
      {(screen === 'PLAYING' || screen === 'PAUSED' || screen === 'GAMEOVER') && (
        <div className="absolute inset-0 z-0">
          <PhaserGame
            key={`run_${runSessionKey}`}
            inputManager={inputManager}
            characterId={currentCharacterId}
            gameMode={currentMode}
            seed={currentRunSeed}
            screenShakeEnabled={profile.settings.screenShake}
            isPaused={screen === 'PAUSED'}
            onStatsUpdate={setHudStats}
            onGameOver={handleGameOver}
            onQuit={handleQuitToMenu}
          />

          {/* In-game HUD */}
          {screen === 'PLAYING' && (
            <HUD
              stats={hudStats}
              gameMode={currentMode}
              showTouchControls={showTouchControls}
              inputManager={inputManager}
              onPause={handlePause}
            />
          )}
        </div>
      )}

      {/* Main Menu Screen */}
      {screen === 'MENU' && (
        <div className="absolute inset-0 z-10">
          <MainMenu
            profile={profile}
            onStartGame={handleStartGame}
            onOpenAchievements={() => setActiveModal('achievements')}
            onOpenStats={() => setActiveModal('stats')}
            onOpenSettings={() => setActiveModal('settings')}
            onOpenCredits={() => setActiveModal('credits')}
          />
        </div>
      )}

      {/* Pause Screen Overlay */}
      {screen === 'PAUSED' && (
        <PauseModal
          settings={profile.settings}
          onResume={handleResume}
          onRestart={handleRestart}
          onQuit={handleQuitToMenu}
          onUpdateSettings={handleUpdateSettings}
        />
      )}

      {/* Game Over Screen Overlay */}
      {screen === 'GAMEOVER' && gameOverResult && (
        <GameOverModal
          data={gameOverResult.data}
          isNewHighScore={gameOverResult.isNewHighScore}
          isNewLongestDistance={gameOverResult.isNewLongestDistance}
          unlockedAchievements={gameOverResult.unlockedAchievements}
          unlockedSkins={gameOverResult.unlockedSkins}
          onPlayAgain={handleRestart}
          onMainMenu={handleQuitToMenu}
        />
      )}

      {/* Modals from Menu */}
      {activeModal === 'achievements' && (
        <AchievementsModal
          achievements={profile.achievements}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'stats' && (
        <StatsModal
          profile={profile}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'settings' && (
        <SettingsModal
          settings={profile.settings}
          onClose={() => setActiveModal(null)}
          onUpdateSettings={handleUpdateSettings}
        />
      )}

      {activeModal === 'credits' && (
        <CreditsModal
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
