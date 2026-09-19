/**
 * Drosophila Neural Chess Rules & Match Constants.
 */

import type { PlayerColor, SeatId, TimePreset } from './types';

export const SEAT_COLORS: Record<SeatId, PlayerColor> = {
  0: 'WHITE',
  1: 'BLACK',
};

export const COLOR_HEX: Record<PlayerColor, string> = {
  WHITE: '#edebe6',
  BLACK: '#1e1c1a',
};

export const ACCENT_HEX: Record<PlayerColor, string> = {
  WHITE: '#50c2f8',
  BLACK: '#f87171',
};

export const TIME_PRESETS: Record<TimePreset, { initialMs: number; incMs: number; label: string }> = {
  'CASUAL': { initialMs: 0, incMs: 0, label: 'Casual (No Timer)' },
  '1+0': { initialMs: 60_000, incMs: 0, label: '1 min Bullet' },
  '3+0': { initialMs: 180_000, incMs: 0, label: '3 min Blitz' },
  '5+0': { initialMs: 300_000, incMs: 0, label: '5 min Blitz' },
  '10+0': { initialMs: 600_000, incMs: 0, label: '10 min Rapid' },
  '15+10': { initialMs: 900_000, incMs: 10_000, label: '15 | 10 Rapid' },
  '30+0': { initialMs: 1_800_000, incMs: 0, label: '30 min Classical' },
};

/** Angle for player stations: White South (angle = -PI/2), Black North (angle = PI/2). */
export function seatAngle(seat: SeatId): number {
  return seat === 0 ? -Math.PI / 2 : Math.PI / 2;
}

export function opponentSeat(seat: SeatId): SeatId {
  return seat === 0 ? 1 : 0;
}
