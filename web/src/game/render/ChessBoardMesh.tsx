/**
 * The tournament board.
 *
 * This is the thing the whole screen is arranged around, so it is built for
 * readability before anything else:
 *
 *   - Light squares are **ivory, not white**. Pure white blows out under the
 *     stadium's key light and takes the ivory pieces with it; at #e6dbc6 the
 *     white pieces still read as lighter than the squares they stand on.
 *   - Dark squares are a warm charcoal rather than black, so a black piece on
 *     a dark square is still a silhouette you can find.
 *   - Highlights are **rings and dots on top of** the squares, never the
 *     square's own colour. Flooding a tile with emissive destroys the
 *     chequer pattern exactly when the player most needs it -- while they are
 *     reading a move.
 *   - The coordinates are real glyphs. They used to be blank grey quads,
 *     which is worse than having none.
 *
 * This file draws the *surface* and the player's own selection. Everything
 * that describes the position -- last move, check, captures -- lives in
 * `BoardAnnotations`, so there is one place that answers "what is the board
 * telling me" rather than two that can disagree.
 */

import { useMemo } from 'react';
import { DoubleSide, FrontSide } from 'three';

import { CHESS_BOARD, coordsToSquare, squareToWorld, type Square } from '../chessEngine';
import { useGame } from '../store';
import { textTexture } from './textTexture';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/**
 * Board surface palette, tuned against the stadium key light rather than in
 * a vacuum. Exported so the offline renderer checks the same numbers the
 * game draws, instead of a copy that can drift.
 */
export const BOARD_PALETTE = {
  /**
   * The light square is a full tan, not a pale cream.
   *
   * At #e6dbc6 it sat within about ten percent of the white pieces' own
   * value, and a white bishop on a light square stopped being a shape --
   * the offline render made that obvious immediately. Dropping the square
   * puts a clear step between the two while keeping it unmistakably a
   * light square next to #4a3f36.
   */
  light: '#d8c8ac',
  dark: '#4a3f36',
  /** The frame: warm timber, with only a hairline of brass. */
  frame: '#241d18',
  bezel: '#7a6435',
  coord: '#c9bda6',
} as const;

const SQUARE_LIGHT = BOARD_PALETTE.light;
const SQUARE_DARK = BOARD_PALETTE.dark;
const FRAME = BOARD_PALETTE.frame;
const BEZEL = BOARD_PALETTE.bezel;
const COORD_INK = BOARD_PALETTE.coord;

export function ChessBoardMesh() {
  const selectedSquare = useGame((s) => s.selectedSquare);
  const legalMoves = useGame((s) => s.legalMovesForSelected);
  const selectSquare = useGame((s) => s.selectSquare);

  const destinationMap = useMemo(() => {
    const map = new Map<Square, { isCapture: boolean }>();
    for (const m of legalMoves) map.set(m.to, { isCapture: m.isCapture });
    return map;
  }, [legalMoves]);

  const squares = useMemo(() => {
    const list: { square: Square; isLight: boolean; position: [number, number, number] }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = coordsToSquare(f, r);
        list.push({
          square: sq,
          isLight: (f + r) % 2 !== 0,
          position: squareToWorld(sq),
        });
      }
    }
    return list;
  }, []);

  const size = CHESS_BOARD.size;
  const cell = CHESS_BOARD.cellSize;
  const frameSize = size + 3.4;
  const top = CHESS_BOARD.deckY;

  return (
    <group name="chess-board">
      {/* --- frame ------------------------------------------------------ */}
      <mesh
        position={[0, top - CHESS_BOARD.slabHeight / 2 - 0.04, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[frameSize, CHESS_BOARD.slabHeight, frameSize]} />
        <meshStandardMaterial color={FRAME} roughness={0.55} metalness={0.15} />
      </mesh>

      {/* a hairline of brass where the frame meets the playing surface */}
      <mesh position={[0, top - 0.05, 0]} receiveShadow>
        <boxGeometry args={[size + 0.44, 0.1, size + 0.44]} />
        <meshStandardMaterial color={BEZEL} roughness={0.42} metalness={0.55} />
      </mesh>

      {/* --- the 64 squares --------------------------------------------- */}
      {squares.map(({ square, isLight, position }) => (
        <BoardSquare
          key={square}
          square={square}
          isLight={isLight}
          position={position}
          cell={cell}
          selected={selectedSquare === square}
          destination={destinationMap.get(square) ?? null}
          onSelect={selectSquare}
        />
      ))}

      {/* --- coordinates ------------------------------------------------- */}
      <Coordinates size={size} cell={cell} top={top} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// one square
// ---------------------------------------------------------------------------

function BoardSquare({
  square,
  isLight,
  position,
  cell,
  selected,
  destination,
  onSelect,
}: {
  square: Square;
  isLight: boolean;
  position: [number, number, number];
  cell: number;
  selected: boolean;
  destination: { isCapture: boolean } | null;
  onSelect: (square: Square) => void;
}) {
  const tint = isLight ? SQUARE_LIGHT : SQUARE_DARK;

  return (
    <group position={position}>
      {/* The tile keeps its own colour in every state. Nothing below tints
          it; the state is shown by what sits on top. */}
      <mesh
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect(square);
        }}
      >
        <boxGeometry args={[cell * 0.99, 0.09, cell * 0.99]} />
        <meshStandardMaterial
          color={tint}
          roughness={isLight ? 0.62 : 0.55}
          metalness={0.04}
        />
      </mesh>

      {/* the square the player has picked up: an outline, not a wash */}
      {selected && (
        <mesh position={[0, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[cell * 0.40, cell * 0.485, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial
            color="#f0b429"
            transparent
            opacity={0.95}
            side={DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* where it may go: a small dot, or a ring around what it would take */}
      {destination && (
        <mesh position={[0, 0.056, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          {destination.isCapture ? (
            <ringGeometry args={[cell * 0.36, cell * 0.44, 36]} />
          ) : (
            <circleGeometry args={[cell * 0.13, 24]} />
          )}
          <meshBasicMaterial
            color={destination.isCapture ? '#fb7185' : '#7dd3fc'}
            transparent
            opacity={destination.isCapture ? 0.9 : 0.62}
            side={DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// coordinates
// ---------------------------------------------------------------------------

/**
 * Files and ranks around the frame.
 *
 * Laid flat on the border and rotated so each glyph reads the right way up
 * from the side of the board it belongs to -- and never mirrored, because
 * every label is single-sided and faces the sky.
 */
function Coordinates({ size, cell, top }: { size: number; cell: number; top: number }) {
  const edge = size / 2 + 0.85;
  const glyph = cell * 0.42;

  return (
    <group name="coordinates">
      {FILES.map((file, i) => {
        const x = (i - 3.5) * cell;
        return (
          <group key={file}>
            <Glyph text={file} position={[x, top + 0.005, edge]} size={glyph} />
            <Glyph text={file} position={[x, top + 0.005, -edge]} size={glyph} spin={Math.PI} />
          </group>
        );
      })}

      {RANKS.map((rank, i) => {
        const z = -(i - 3.5) * cell;
        return (
          <group key={rank}>
            <Glyph
              text={rank}
              position={[-edge, top + 0.005, z]}
              size={glyph}
              spin={Math.PI / 2}
            />
            <Glyph
              text={rank}
              position={[edge, top + 0.005, z]}
              size={glyph}
              spin={-Math.PI / 2}
            />
          </group>
        );
      })}
    </group>
  );
}

function Glyph({
  text,
  position,
  size,
  spin = 0,
}: {
  text: string;
  position: [number, number, number];
  size: number;
  /** Rotation in the board plane, so the glyph faces its own edge. */
  spin?: number;
}) {
  const map = useMemo(
    () => textTexture(text.toUpperCase(), { size: 96, color: COORD_INK, weight: 800, fill: 0.7 }),
    [text],
  );

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, spin]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        map={map}
        transparent
        opacity={0.75}
        // single-sided and facing up: it can never be seen from behind, so it
        // can never appear reversed
        side={FrontSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
