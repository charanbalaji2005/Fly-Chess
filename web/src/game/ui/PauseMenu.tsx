/**
 * Pause Menu for Drosophila Neural Chess.
 */

import { useGame } from '../store';
import { Card, GameButton } from './kit';

export function PauseMenu({ onOpenLab }: { onOpenLab: () => void }) {
  const setPaused = useGame((s) => s.setPaused);
  const setScreen = useGame((s) => s.setScreen);
  const startMatch = useGame((s) => s.startMatch);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card style={{ width: 'min(380px, 92vw)', padding: '28px' }}>
        <h2 className="text-xl font-bold tracking-wider text-sky-400 mb-6 text-center">
          MATCH PAUSED
        </h2>

        <div className="flex flex-col gap-2.5">
          <GameButton variant="primary" full size="lg" onClick={() => setPaused(false)}>
            Resume Match
          </GameButton>

          <GameButton full onClick={() => startMatch({})}>
            Restart Match
          </GameButton>

          <GameButton variant="ghost" full onClick={onOpenLab}>
            Connectome Neural Lab
          </GameButton>

          <div className="my-1.5 h-[1px] bg-slate-800" />

          <GameButton
            variant="danger"
            full
            onClick={() => {
              setPaused(false);
              setScreen('MENU');
            }}
          >
            Quit to Main Menu
          </GameButton>
        </div>
      </Card>
    </div>
  );
}
