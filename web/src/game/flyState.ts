/**
 * What each Drosophila player is doing, and why.
 *
 * The flies are the players.
 * Every state is a pure function of the chess match state and the active CarryPlan.
 */

import type { CarryStage } from './carry';
import type { GamePhase } from './types';

export type FlyState =
  | 'IDLE'
  | 'WATCHING'
  | 'ATTENTIVE'
  | 'THINKING'
  | 'APPROACHING_PIECE'
  | 'GRABBING'
  | 'CARRYING'
  | 'PLACING'
  | 'RETURNING'
  | 'CELEBRATING';

export interface FlyObservation {
  active: boolean;
  won: boolean;
  phase: GamePhase;
  thinking: boolean;
  carry: CarryStage | null;
}

export function flyStateFor(o: FlyObservation): FlyState {
  if (o.won) {
    return 'CELEBRATING';
  }

  // Active carry errand in progress
  if (o.carry && o.carry !== 'DONE') {
    switch (o.carry) {
      case 'APPROACH':
        return 'APPROACHING_PIECE';
      case 'GRAB':
        return 'GRABBING';
      case 'CARRY':
        return 'CARRYING';
      case 'PLACE':
        return 'PLACING';
      case 'RETURN':
        return 'RETURNING';
      default:
        break;
    }
  }

  // Active player turn
  if (o.active) {
    if (o.thinking || o.phase === 'THINKING') {
      return 'THINKING';
    }
    if (o.phase === 'PIECE_SELECTED' || o.phase === 'READY') {
      return 'ATTENTIVE';
    }
  }

  // Inactive player watching the opponent's move
  return 'WATCHING';
}

export function isCarryState(state: FlyState): boolean {
  return (
    state === 'APPROACHING_PIECE' ||
    state === 'GRABBING' ||
    state === 'CARRYING' ||
    state === 'PLACING' ||
    state === 'RETURNING'
  );
}
