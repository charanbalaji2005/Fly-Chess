/**
 * Shared test helpers.
 */

import { BOARD_PALETTE } from '../render/ChessBoardMesh';
import { PIECE_MATERIALS } from '../render/ChessPieces';

/** Perceived brightness of a #rrggbb colour, 0..1. */
export function luma(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The four values that decide whether the board is readable, as brightness.
 *
 * Read from the real palette and the real piece materials rather than from
 * a copy, so a change to either is what the assertion sees.
 */
export function resolveBoardPalette(): {
  light: number;
  dark: number;
  white: number;
  black: number;
} {
  return {
    light: luma(BOARD_PALETTE.light),
    dark: luma(BOARD_PALETTE.dark),
    white: luma(`#${PIECE_MATERIALS.w.color.getHexString()}`),
    black: luma(`#${PIECE_MATERIALS.b.color.getHexString()}`),
  };
}
