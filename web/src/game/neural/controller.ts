/**
 * Drosophila Chess Neural Controller.
 *
 * Bridges the Chess Engine and AI levels to sensory and neural representations.
 */

import { Chess } from 'chess.js';
import type { LegalMove } from '../chessEngine';
import type { SeatId, AiLevel } from '../types';
import { encodeSensoryState } from './encoder';
import type { NeuralDecision, BrainState, ActivityVector, NeuralActivity } from './types';

export function computeNeuralDecision(
  chess: Chess,
  seat: SeatId,
  level: AiLevel,
  selectedMove?: LegalMove
): NeuralDecision {
  const sensory = encodeSensoryState(chess, seat);

  // Compute activity vector
  let brainState: BrainState = 'IDLE';
  if (selectedMove) {
    brainState = 'DECISION';
  } else if (chess.turn() === (seat === 0 ? 'w' : 'b')) {
    brainState = sensory.tacticalTension > 0.4 ? 'TACTICAL_ANALYSIS' : 'BOARD_SCAN';
  } else {
    brainState = 'IDLE';
  }

  const levelMultiplier =
    level === 'MASTER' ? 1.2 :
    level === 'EXPERT' ? 1.1 :
    level === 'HARD' ? 1.0 :
    level === 'NORMAL' ? 0.9 :
    level === 'EASY' ? 0.8 : 0.7;

  const sensoryMag = Math.min(1, (sensory.tacticalTension * 0.5 + sensory.opponentThreat * 0.5) * levelMultiplier);
  const centralMag = Math.min(1, (sensory.centerControl * 0.4 + sensory.movementOpportunity * 0.6) * levelMultiplier);
  const motorMag = selectedMove ? 0.95 : 0.15;
  const visualMag = Math.min(1, 0.6 + sensory.tacticalTension * 0.4);

  const activity: ActivityVector = {
    sensory: sensoryMag,
    central: centralMag,
    motor: motorMag,
    visual: visualMag,
  };

  const neuralActivity: NeuralActivity = {
    sensory: [
      sensory.opponentThreat,
      sensory.materialBalance,
      sensory.movementOpportunity,
      sensory.centerControl,
      sensory.kingSafety,
      sensory.tacticalTension,
      sensory.currentTurn,
    ],
    central: [sensoryMag, centralMag, visualMag, sensory.tacticalTension],
    decision: [centralMag, motorMag, sensory.materialBalance, sensory.centerControl],
    motor: motorMag,
  };

  return {
    sensory,
    state: brainState,
    activity,
    neuralActivity,
    selectedMove,
  };
}
