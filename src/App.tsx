/**
 * Jungle Run - Main React Application Shell
 * State machine managing MainMenu, Active Phaser Gameplay, HUD, Pause, GameOver,
 * and Modals.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { LocalProfile, GameMode, GameSettings } from './data/types.ts';
import { gameRepository } from './data/repository.ts';
import { createDefaultProfile } from './data/storage.ts';
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

type AppScreen = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';
type ModalType = 'achievements' | 'stats' | 'settings' | 'credits' | null;

export default function App() {
  const [profile, setProfile] = useState<LocalProfile>(() => createDefaultProfile());
  const [screen, setScreen] = useState<AppScreen>('MENU');
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // Active Run Configuration
  const [currentMode, setCurrentMode] = useState<GameMode>('endless');
  const [currentCharacterId, setCurrentCharacterId] = useState<string>('harry');
  const [currentRunSeed, setCurrentRunSeed] = useState<number>(1337);
  const [runSessionKey, setRunSessionKey] = useState<number>(1);

  // Live HUD telemetry
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
  const [gameOverResult, setGameOverResult] = useState<{
    data: GameOverData;
    isNewHighScore: boolean;
    isNewLongestDistance: boolean;
    unlockedAchievements: string[];
    unlockedSkins: string[];
  } | null>(null);

  // Initialize Input Manager once
  const inputManager = useMemo(() => {
    return new InputManager(profile.settings.keyBindings);
  }, []);

  // Load and subscribe to Repository Profile
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    gameRepository.getProfile().then((loadedProfile) => {
      setProfile(loadedProfile);
      setCurrentCharacterId(loadedProfile.selectedCharacterId || 'harry');
      soundManager.setVolumes(
        loadedProfile.settings.musicVolume,
        loadedProfile.settings.sfxVolume,
        loadedProfile.settings.isMuted
      );
      inputManager.updateBindings(loadedProfile.settings.keyBindings);

      unsubscribe = gameRepository.subscribe((updated) => {
        setProfile(updated);
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [inputManager]);

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
  const showTouchControls = useMemo(() => {
    const pref = profile.settings.showTouchControls;
    if (pref === 'always') return true;
    if (pref === 'never') return false;
    // 'auto'
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, [profile.settings.showTouchControls]);

  // Handlers
  const handleStartGame = (mode: GameMode, characterId: string, customSeed?: number) => {
    setCurrentMode(mode);
    setCurrentCharacterId(characterId);
    setCurrentRunSeed(customSeed !== undefined ? customSeed : Math.floor(Math.random() * 1000000));
    setRunSessionKey(prev => prev + 1);
    setGameOverResult(null);
    setScreen('PLAYING');
  };

  const handlePause = () => {
    soundManager.playClick();
    setScreen('PAUSED');
  };

  const handleResume = () => {
    soundManager.playClick();
    setScreen('PLAYING');
  };

  const handleRestart = () => {
    soundManager.playClick();
    setCurrentRunSeed(Math.floor(Math.random() * 1000000));
    setRunSessionKey(prev => prev + 1);
    setGameOverResult(null);
    setScreen('PLAYING');
  };

  const handleQuitToMenu = () => {
    soundManager.playClick();
    soundManager.stopMusic();
    setScreen('MENU');
  };

  const handleGameOver = async (data: GameOverData) => {
    // Record run in repository
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

    setScreen('GAMEOVER');
  };

  const handleUpdateSettings = (partial: Partial<GameSettings>) => {
    gameRepository.updateSettings(partial);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-stone-950 font-body select-none">
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
