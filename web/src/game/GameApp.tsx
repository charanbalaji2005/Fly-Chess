/**
 * Drosophila Neural Chess - Root Application Component.
 */

import { useGameDriver, useGameKeys } from './driver';
import { GameScene } from './render/GameScene';
import { useGame } from './store';
import { GameHud } from './ui/GameHud';
import { MainMenu } from './ui/MainMenu';
import { MatchSetup } from './ui/MatchSetup';
import { PauseMenu } from './ui/PauseMenu';
import { PromotionDialog } from './ui/PromotionDialog';
import { ResultScreen } from './ui/ResultScreen';

export function GameApp({ onOpenLab }: { onOpenLab: () => void }) {
  const screen = useGame((s) => s.screen);
  const paused = useGame((s) => s.paused);

  // Clocks, frame ticks, and keyboard listeners
  useGameDriver();
  useGameKeys();

  return (
    <div className="relative h-full w-full" style={{ background: 'var(--void)' }}>
      <GameScene />

      {screen === 'MENU' && <MainMenu onOpenLab={onOpenLab} />}
      {screen === 'SETUP' && <MatchSetup />}
      {screen === 'GAME' && <GameHud onOpenLab={onOpenLab} />}
      {screen === 'RESULT' && <ResultScreen />}

      {screen === 'GAME' && <PromotionDialog />}
      {screen === 'GAME' && paused && <PauseMenu onOpenLab={onOpenLab} />}
    </div>
  );
}
