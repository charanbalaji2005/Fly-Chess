/**
 * Types for the Drosophila chess neural decision and sensory layer.
 */

import type { LegalMove } from '../chessEngine';

export interface SensoryState {
  opponentThreat: number;
  materialBalance: number;
  movementOpportunity: number;
  centerControl: number;
  kingSafety: number;
  tacticalTension: number;
  currentTurn: number;
}

export const SENSORY_CHANNELS: (keyof SensoryState)[] = [
  'opponentThreat',
  'materialBalance',
  'movementOpportunity',
  'centerControl',
  'kingSafety',
  'tacticalTension',
  'currentTurn',
];

export const SENSORY_LABELS: Record<keyof SensoryState, string> = {
  opponentThreat: 'Threat',
  materialBalance: 'Material',
  movementOpportunity: 'Mobility',
  centerControl: 'Center Control',
  kingSafety: 'King Safety',
  tacticalTension: 'Tension',
  currentTurn: 'Tempo',
};

export type BrainState =
  | 'IDLE'
  | 'BOARD_SCAN'
  | 'PIECE_ANALYSIS'
  | 'TACTICAL_ANALYSIS'
  | 'DECISION'
  | 'MOTOR_PREPARATION'
  | 'MOTOR_EXECUTION'
  | 'CARRYING'
  | 'REWARD'
  | 'THREAT'
  | 'VICTORY';

export interface ActivityVector {
  sensory: number;
  central: number;
  motor: number;
  visual: number;
}

export interface NeuralActivity {
  sensory: number[];
  central: number[];
  decision: number[];
  motor: number;
}

export const EMPTY_ACTIVITY: NeuralActivity = {
  sensory: [0, 0, 0, 0, 0, 0, 0],
  central: [0, 0, 0, 0],
  decision: [0, 0, 0, 0],
  motor: 0,
};

export interface NeuralDecision {
  sensory: SensoryState;
  state: BrainState;
  activity: ActivityVector;
  neuralActivity?: NeuralActivity;
  selectedMove?: LegalMove;
}
