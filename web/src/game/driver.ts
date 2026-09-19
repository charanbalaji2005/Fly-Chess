/**
 * Game Driver & Keyboard Controllers for Drosophila Neural Chess.
 */

import { useEffect } from 'react';
import { useGame } from './store';

export function useGameDriver(): void {
  const phase = useGame((s) => s.phase);
  const paused = useGame((s) => s.paused);
  const currentSeat = useGame((s) => s.currentSeat);
  const players = useGame((s) => s.players);
  const aiThinking = useGame((s) => s.aiThinking);
  const carry = useGame((s) => s.carry);
  const tickAi = useGame((s) => s.tickAi);
  const isOver = useGame((s) => s.status.isOver);
  const sampleCarryFrame = useGame((s) => s.sampleCarryFrame);
  const tickClocks = useGame((s) => s.tickClocks);

  // Trigger AI turn when it's AI player's turn and phase is READY
  useEffect(() => {
    if (paused || phase !== 'READY' || aiThinking || isOver) return;
    const currPlayer = players[currentSeat];
    if (currPlayer && currPlayer.controller === 'AI') {
      const timer = setTimeout(() => {
        tickAi();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [phase, currentSeat, players, aiThinking, paused, isOver, tickAi]);

  // Frame tick for carry animation and clocks
  useEffect(() => {
    let animFrame: number;

    const loop = () => {
      const now = Date.now();
      if (!paused) {
        if (carry) {
          sampleCarryFrame(now);
        }
        if (phase !== 'GAME_OVER') {
          tickClocks(now);
        }
      }
      animFrame = requestAnimationFrame(loop);
    };

    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [carry, paused, phase, sampleCarryFrame, tickClocks]);
}

export function useGameKeys(): void {
  const selectSquare = useGame((s) => s.selectSquare);
  const undoMove = useGame((s) => s.undoMove);
  const setCamera = useGame((s) => s.setCamera);
  const togglePanel = useGame((s) => s.togglePanel);
  const setUiPanel = useGame((s) => s.setUiPanel);
  const setPaused = useGame((s) => s.setPaused);
  const paused = useGame((s) => s.paused);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input field
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'escape':
          // close whatever is open first, then put the piece back down
          setUiPanel('NONE');
          selectSquare(null);
          break;
        case 'u':
          undoMove();
          break;
        case 'b':
        case 'n':
          useGame.getState().toggleBrainVis();
          break;
        case 'm':
          togglePanel('HISTORY');
          break;
        case 'v':
          togglePanel('VIEW');
          break;
        case 'p':
          setPaused(!paused);
          break;
        case '1':
          setCamera('BOARD');
          break;
        case '2':
          setCamera('WHITE');
          break;
        case '3':
          setCamera('BLACK');
          break;
        case '4':
          setCamera('PIECE');
          break;
        case '5':
          setCamera('NEURAL');
          break;
        case '6':
          setCamera('SPECTATOR');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectSquare, undoMove, setCamera, togglePanel, setUiPanel, setPaused, paused]);
}
