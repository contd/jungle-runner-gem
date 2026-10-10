/**
 * Jungle Run - Phaser 3 React Canvas Container
 * Manages game lifecycle, scene transitions, responsive scaling, and event propagation.
 */

import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { GameScene, GameHUDStats, GameOverData } from './scenes/GameScene.ts';
import { InputManager } from './input/InputManager.ts';
import { GameMode } from '../data/types.ts';

interface PhaserGameProps {
  inputManager: InputManager;
  characterId: string;
  gameMode: GameMode;
  seed: number;
  screenShakeEnabled: boolean;
  isPaused: boolean;
  onStatsUpdate: (stats: GameHUDStats) => void;
  onGameOver: (result: GameOverData) => void;
}

export const PhaserGame: React.FC<PhaserGameProps> = ({
  inputManager,
  characterId,
  gameMode,
  seed,
  screenShakeEnabled,
  isPaused,
  onStatsUpdate,
  onGameOver
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing instance if present
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 960,
      height: 600,
      backgroundColor: '#0c1a11',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 1200 },
          debug: false
        }
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      scene: [BootScene, GameScene]
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Attach touch handler to the canvas container for mobile gestures
    inputManager.bindTouchElement(containerRef.current);

    // Pass data into GameScene once BootScene finishes
    game.events.once('ready', () => {
      // BootScene starts GameScene automatically; listen for GameScene start to send data
      const gameScene = game.scene.getScene('GameScene') as GameScene;
      if (gameScene) {
        game.scene.stop('GameScene');
        game.scene.start('GameScene', {
          inputManager,
          characterId,
          gameMode,
          seed,
          screenShakeEnabled,
          onStatsUpdate,
          onGameOver
        });
      }
    });

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
      if (isPaused) {
        gameScene.scene.pause();
      } else {
        gameScene.scene.resume();
      }
    }
  }, [isPaused]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden bg-emerald-950/40 select-none touch-none"
      style={{ touchAction: 'none' }}
    />
  );
};
