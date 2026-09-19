/**
 * Match Results Screen for Drosophila Neural Chess.
 */

import { useGame } from '../store';
import { Card, GameButton } from './kit';

export function ResultScreen() {
  const status = useGame((s) => s.status);
  const winner = useGame((s) => s.winner);
  const players = useGame((s) => s.players);
  const moveHistory = useGame((s) => s.moveHistory);
  const startMatch = useGame((s) => s.startMatch);
  const setScreen = useGame((s) => s.setScreen);

  const white = players[0];
  const black = players[1];

  const winnerPlayer = winner !== null ? players[winner] : null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <Card style={{ width: 'min(520px, 95vw)', padding: '32px' }}>
        <div className="text-center mb-6">
          <span className="text-xs font-mono font-bold tracking-widest text-slate-400 uppercase">
            Match Concluded
          </span>
          <h2 className="mt-2 text-3xl font-black tracking-wide text-amber-400">
            {winnerPlayer ? `${winnerPlayer.name.toUpperCase()} WINS` : 'DRAW'}
          </h2>
          <p className="mt-1 text-xs text-slate-400 font-semibold">{status.statusText}</p>
        </div>

        {/* Match Statistics */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Match Statistics
          </h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500">Total Moves:</span>{' '}
              <strong className="text-slate-200">{moveHistory.length}</strong>
            </div>
            <div>
              <span className="text-slate-500">Duration:</span>{' '}
              <strong className="text-slate-200">
                {Math.floor(moveHistory.length * 2.4)}s est.
              </strong>
            </div>
            <div>
              <span className="text-slate-500">White Captures:</span>{' '}
              <strong className="text-slate-200">{white.stats.captures}</strong>
            </div>
            <div>
              <span className="text-slate-500">Black Captures:</span>{' '}
              <strong className="text-slate-200">{black.stats.captures}</strong>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <GameButton full onClick={() => setScreen('MENU')}>
            Main Menu
          </GameButton>
          <GameButton
            variant="primary"
            full
            size="lg"
            onClick={() => startMatch({})}
          >
            Play Again
          </GameButton>
        </div>
      </Card>
    </div>
  );
}
