/**
 * Title Screen for Drosophila Neural Chess.
 */

import { useGame } from '../store';
import { Card, GameButton } from './kit';

export function MainMenu() {
  const startMatch = useGame((s) => s.startMatch);
  const setScreen = useGame((s) => s.setScreen);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-start pointer-events-none">
      <div className="pointer-events-auto ml-8 sm:ml-16">
        <Card style={{ width: 'min(400px, 90vw)', padding: 28 }}>
          <div className="mb-6">
            <h1 className="text-2xl font-extrabold tracking-wider text-sky-400">
              DROSOPHILA NEURAL CHESS
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Championship 3D chess stadium where Drosophila flies act as the player agents
              physically moving chess pieces, powered by authoritative FIDE rules, 6 genuine AI
              difficulty levels, and a live FlyWire whole-brain connectome map.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <GameButton
              variant="primary"
              size="lg"
              full
              onClick={() => startMatch({ mode: 'HUMAN_VS_AI', aiLevel: 'HARD', playerColor: 'WHITE' })}
            >
              Quick Play (vs Hard AI)
            </GameButton>

            <GameButton full onClick={() => setScreen('SETUP')}>
              Match Setup & AI Level
            </GameButton>
          </div>

          <p className="mt-6 text-[10px] leading-relaxed text-slate-500 font-mono">
            Full 8×8 FIDE chess rules with check, checkmate, stalemate, castling, en passant, and
            promotion.
          </p>
        </Card>
      </div>
    </div>
  );
}
