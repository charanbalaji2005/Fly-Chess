/**
 * Drosophila Neural Chess - Root Application Component.
 */

import { useEffect } from 'react';
import { useGameDriver, useGameKeys } from './driver';
import { GameScene } from './render/GameScene';
import { useGame } from './store';
import { GameHud } from './ui/GameHud';
import { MainMenu } from './ui/MainMenu';
import { MatchSetup } from './ui/MatchSetup';
import { PauseMenu } from './ui/PauseMenu';
import { PromotionDialog } from './ui/PromotionDialog';
import { ResultScreen } from './ui/ResultScreen';
import { useStore } from '../store/useStore';


export function GameApp() {
  const screen = useGame((s) => s.screen);
  const paused = useGame((s) => s.paused);

  // Preload measured connectome data in background for real-time 3D visualization
  useEffect(() => {
    void useStore.getState().bootstrap();
  }, []);

  // Clocks, frame ticks, and keyboard listeners
  useGameDriver();
  useGameKeys();

  return (
    <div className="relative h-full w-full" style={{ background: 'var(--void)' }}>
      <GameScene />

      {screen === 'MENU' && <MainMenu />}
      {screen === 'SETUP' && <MatchSetup />}
      {screen === 'GAME' && <GameHud />}
      {screen === 'RESULT' && <ResultScreen />}

      {screen === 'GAME' && <PromotionDialog />}
      {screen === 'GAME' && paused && <PauseMenu />}
    </div>
  );
}

