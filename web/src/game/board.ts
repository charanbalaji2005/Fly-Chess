/**
 * 3D Chess Board geometry and coordinate mappings.
 *
 * Provides dimensions for the 8x8 tournament chessboard elevated in the stadium,
 * player stations for White (South) and Black (North), and captured piece trays.
 */

import { CHESS_BOARD, squareToWorld, worldToSquare, squareToCoords, coordsToSquare } from './chessEngine';
import type { PieceColor } from './chessEngine';
import type { SeatId } from './types';
import { seatAngle } from './rules';

export { squareToWorld, worldToSquare, squareToCoords, coordsToSquare, seatAngle };

export const BOARD = {
  /** 8 cells across */
  cells: 8,
  /** Cell size in 3D units */
  cell: CHESS_BOARD.cellSize,
  /** 8 * 3.2 = 25.6 */
  get size() {
    return this.cells * this.cell;
  },
  /** Top surface of board tiles */
  deckY: CHESS_BOARD.deckY,
  /** Base slab thickness */
  slab: CHESS_BOARD.slabHeight,
  /** Border bezel width outside the 8x8 tiles */
  borderWidth: 1.8,
  coreRadius: 4.5,
  tileLift: 0.34,

  // -- Stadium radii --------------------------------------------------------
  /** Clear arena floor */
  arenaRadius: 28,
  /** Where White & Black fly stations perch */
  stationRadius: 21,
  /** Raised seating row inner radius */
  spectatorRadius: 36,
  /** Surrounding wall radius */
  wallRadius: 48,
  /** Outermost roof radius */
  outerRadius: 56,
} as const;

/**
 * Returns the perched rest position for the Drosophila player at the given seat.
 */
export function seatStation(seat: SeatId): [number, number, number] {
  return seat === 0 ? CHESS_BOARD.whiteStation : CHESS_BOARD.blackStation;
}

/**
 * Returns world coordinates for a captured piece resting in the sidelines tray.
 * White pieces captured go to West sideline (negative x), Black to East sideline (positive x).
 */
export function capturedSlotWorld(color: PieceColor, index: number): [number, number, number] {
  const x = color === 'w' ? -16.5 - (index % 2) * 2.2 : 16.5 + (index % 2) * 2.2;
  const z = -10.0 + Math.floor(index / 2) * 2.6;
  const y = BOARD.deckY;
  return [x, y, z];
}
