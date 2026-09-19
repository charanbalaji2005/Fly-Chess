/**
 * Stadium Crowd Reaction System for Drosophila Neural Chess.
 *
 * Models the crowd excitement and mood in the 3D stadium based on chess events:
 * quiet attentiveness during thinking, heightened excitement on captures and checks,
 * and stadium eruption on checkmate / victory celebrations.
 */

export type CrowdMood = 'CALM' | 'ATTENTIVE' | 'EXCITED' | 'CELEBRATING';

export interface CrowdState {
  mood: CrowdMood;
  /** 0..1; how much of the stadium stands is on its feet */
  excitement: number;
  /** Timestamp after which the mood may decay again */
  holdUntil: number;
}

export const CALM_CROWD: CrowdState = {
  mood: 'CALM',
  excitement: 0.1,
  holdUntil: 0,
};

export type ChessCrowdEvent =
  | 'GAME_START'
  | 'THINKING'
  | 'MOVE'
  | 'CAPTURE'
  | 'CHECK'
  | 'CHECKMATE'
  | 'PROMOTION'
  | 'DRAW'
  | 'VICTORY';

export function reactionForEvent(event: ChessCrowdEvent): { mood: CrowdMood; excitement: number; holdMs: number } {
  switch (event) {
    case 'GAME_START':
      return { mood: 'ATTENTIVE', excitement: 0.35, holdMs: 2500 };
    case 'THINKING':
      return { mood: 'ATTENTIVE', excitement: 0.12, holdMs: 800 };
    case 'MOVE':
      return { mood: 'ATTENTIVE', excitement: 0.22, holdMs: 1000 };
    case 'CAPTURE':
      return { mood: 'EXCITED', excitement: 0.65, holdMs: 2400 };
    case 'CHECK':
      return { mood: 'EXCITED', excitement: 0.78, holdMs: 2600 };
    case 'PROMOTION':
      return { mood: 'EXCITED', excitement: 0.82, holdMs: 3000 };
    case 'CHECKMATE':
    case 'VICTORY':
      return { mood: 'CELEBRATING', excitement: 1.0, holdMs: 12000 };
    case 'DRAW':
      return { mood: 'CALM', excitement: 0.2, holdMs: 3000 };
    default:
      return { mood: 'CALM', excitement: 0.1, holdMs: 500 };
  }
}

export function applyChessEvent(current: CrowdState, event: ChessCrowdEvent, now: number): CrowdState {
  const r = reactionForEvent(event);
  if (r.excitement < current.excitement && now < current.holdUntil) {
    return current;
  }
  return {
    mood: r.mood,
    excitement: Math.max(current.excitement, r.excitement),
    holdUntil: now + r.holdMs,
  };
}

export function decay(current: CrowdState, now: number, deltaMs: number): CrowdState {
  if (now < current.holdUntil) return current;

  const next = Math.max(0.08, current.excitement - (deltaMs / 1000) * 0.35);
  return {
    ...current,
    excitement: next,
    mood: moodFor(next),
  };
}

function moodFor(excitement: number): CrowdMood {
  if (excitement >= 0.85) return 'CELEBRATING';
  if (excitement >= 0.5) return 'EXCITED';
  if (excitement >= 0.2) return 'ATTENTIVE';
  return 'CALM';
}

export const MOOD_LABEL: Record<CrowdMood, string> = {
  CALM: 'Crowd settled',
  ATTENTIVE: 'Crowd watching match',
  EXCITED: 'Crowd on their feet',
  CELEBRATING: 'Stadium erupts',
};
