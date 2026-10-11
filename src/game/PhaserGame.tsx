/**
 * Jungle Run - Phaser 3 React Canvas Container
 * Manages game lifecycle, scene transitions, responsive scaling, and event propagation.
 * @module game/PhaserGame
 */

import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { GameScene, GameHUDStats, GameOverData } from './scenes/GameScene.ts';
import { InputManager } from './input/InputManager.ts';
import { GameMode } from '../data/types.ts';
import type { WorldStatus } from './systems/worldTypes.ts';
import { MOVEMENT } from './systems/movement.ts';

/** React-to-Phaser ownership boundary and scene configuration. */
export interface PhaserGameProps {
  /** Long-lived action manager shared with HUD and the application shell. */
  inputManager: InputManager;
  /** Explorer ID; changing it reconstructs the Phaser instance. */
  characterId: string;
  /** Run rules; changing them reconstructs the Phaser instance. */
  gameMode: GameMode;
  /** Chunk-selection seed; changing it reconstructs the Phaser instance. */
  seed: number;
  /** Snapshot camera-shake preference supplied when a run starts. */
  screenShakeEnabled: boolean;
  /** React screen-state pause flag applied separately from game construction. */
  isPaused: boolean;
  /** Consumer of active-frame scene telemetry. */
  onStatsUpdate: (stats: GameHUDStats) => void;
  /** Consumer of terminal run results. */
  onGameOver: (result: GameOverData) => void;
  /** Abandon an unfinished expedition, including a stalled/failed world request. */
  onQuit: () => void;
}

/**
 * Apply combined pause reasons synchronously. ScenePlugin queues transitions:
 * a fast worker reply could otherwise leave a stale queued pause after recovery.
 */
function synchronizePause(scene: Phaser.Scene, paused: boolean): void {
  if (paused && scene.sys.isActive()) scene.sys.pause();
  else if (!paused && scene.sys.isPaused()) scene.sys.resume();
}

/**
 * Own a responsive 960-by-600 Phaser canvas and destroy it on run replacement/unmount.
 * Construction depends on character/mode/seed; callbacks and other settings are
 * captured for that construction rather than continuously rebound.
 * Pause/resume is a separate effect so opening an overlay does not reset the run.
 */
export const PhaserGame: React.FC<PhaserGameProps> = ({
  inputManager,
  characterId,
  gameMode,
  seed,
  screenShakeEnabled,
  isPaused,
  onStatsUpdate,
  onGameOver,
  onQuit
}) => {
  /** DOM surface serving as Phaser's parent and the gesture target. */
  const containerRef = useRef<HTMLDivElement>(null);
  /** Imperative engine instance retained across React render passes. */
  const gameRef = useRef<Phaser.Game | null>(null);
  /** Generation loading/error reason, separate from the application's pause state. */
  const [worldStatus, setWorldStatus] = useState<WorldStatus | null>(null);
  /** Latest external pause flag used by asynchronous generation completion. */
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;

  useEffect(() => {
    if (!containerRef.current) return;
    setWorldStatus(null);

    // Destroy existing instance if present
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    /** Fixed logical resolution scaled to its parent; world gravity uses pixels/second squared. */
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 960,
      height: 600,
      backgroundColor: '#0c1a11',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: MOVEMENT.worldGravity },
          debug: false
        }
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      scene: [new BootScene({
        inputManager, characterId, gameMode, seed, screenShakeEnabled,
        onStatsUpdate, onGameOver,
        onWorldStatus: (status) => {
          setWorldStatus(status);
          const scene = gameRef.current?.scene.getScene('GameScene');
          if (scene) {
            synchronizePause(scene, status !== null || pausedRef.current);
          }
        }
      }), GameScene]
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Attach touch handler to the canvas container for mobile gestures
    inputManager.bindTouchElement(containerRef.current);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [characterId, gameMode, seed]);

  // Handle Pause / Resume from React UI
  useEffect(() => {
    if (!gameRef.current) return;
    const gameScene = gameRef.current.scene.getScene('GameScene');
    if (gameScene) {
      synchronizePause(gameScene, isPaused || worldStatus !== null);
    }
  }, [isPaused, worldStatus]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden bg-emerald-950/40 select-none touch-none"
        style={{ touchAction: 'none' }}
      />
      {worldStatus && (
        <div role={worldStatus.kind === 'error' ? 'alert' : 'status'} className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-emerald-950/95 p-6 text-center text-white">
          <h2 className="text-xl font-bold">{worldStatus.kind === 'error' ? 'Terrain could not be prepared' : 'Preparing terrain...'}</h2>
          <p>{worldStatus.message}</p>
          {worldStatus.retry && (
            <button onClick={worldStatus.retry} className="rounded-lg bg-amber-500 px-6 py-3 font-bold text-emerald-950">
              Retry terrain generation
            </button>
          )}
          <button onClick={onQuit} className="underline">
            Return to menu
          </button>
        </div>
      )}
    </div>
  );
};
