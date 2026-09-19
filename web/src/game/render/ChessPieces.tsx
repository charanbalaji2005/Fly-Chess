/**
 * 3D Procedural Chess Pieces.
 *
 * Renders all 32 tournament-grade chess pieces (Pawn, Rook, Knight, Bishop, Queen, King).
 * Seamlessly tracks live board positions or physical carry coordinates when transported by fly.
 */

import { useMemo } from 'react';
import { MeshStandardMaterial, CylinderGeometry, SphereGeometry, BoxGeometry } from 'three';
import { squareToWorld, capturedSlotWorld } from '../board';
import type { PieceType, PieceColor } from '../chessEngine';
import { useGame } from '../store';

// ---------------------------------------------------------------------------
// Shared Procedural Geometries
// ---------------------------------------------------------------------------
const baseGeom = new CylinderGeometry(0.85, 1.0, 0.25, 24);
const basePedestalGeom = new CylinderGeometry(0.75, 0.85, 0.15, 24);

// Pawn
const pawnBodyGeom = new CylinderGeometry(0.35, 0.65, 0.9, 20);
const pawnCollarGeom = new CylinderGeometry(0.5, 0.4, 0.1, 20);
const pawnHeadGeom = new SphereGeometry(0.42, 20, 20);

// Rook
const rookShaftGeom = new CylinderGeometry(0.55, 0.7, 1.2, 20);
const rookHeadGeom = new CylinderGeometry(0.72, 0.6, 0.35, 20);
const rookCrenelGeom = new BoxGeometry(0.2, 0.22, 0.2);

// Knight
const knightBodyGeom = new CylinderGeometry(0.45, 0.7, 1.0, 16);
const knightHeadGeom = new BoxGeometry(0.55, 0.85, 0.9);
const knightSnoutGeom = new BoxGeometry(0.45, 0.45, 0.5);

// Bishop
const bishopBodyGeom = new CylinderGeometry(0.35, 0.65, 1.4, 20);
const bishopCollarGeom = new CylinderGeometry(0.55, 0.4, 0.12, 20);
const bishopHeadGeom = new SphereGeometry(0.48, 20, 20);
const bishopFinialGeom = new SphereGeometry(0.12, 12, 12);

// Queen
const queenBodyGeom = new CylinderGeometry(0.4, 0.72, 1.8, 24);
const queenCoronetGeom = new CylinderGeometry(0.75, 0.5, 0.4, 24);
const queenBallGeom = new SphereGeometry(0.16, 16, 16);

// King
const kingBodyGeom = new CylinderGeometry(0.42, 0.75, 2.0, 24);
const kingCrownGeom = new CylinderGeometry(0.8, 0.55, 0.45, 24);
const kingCrossVGeom = new BoxGeometry(0.12, 0.42, 0.12);
const kingCrossHGeom = new BoxGeometry(0.32, 0.12, 0.12);

/**
 * The pieces as plain numbers: which primitives, at what height, how wide.
 *
 * The component builds its meshes from these, and the offline renderer
 * reads the same table, so a silhouette checked outside the browser is the
 * silhouette the game draws. `y` is the centre height above the square.
 */
export type PiecePart =
  | { kind: 'cyl'; rTop: number; rBottom: number; h: number; y: number }
  | { kind: 'sphere'; r: number; y: number }
  | { kind: 'box'; w: number; h: number; d: number; y: number; x?: number; z?: number };

export const PIECE_PARTS: Record<PieceType, PiecePart[]> = {
  p: [
    { kind: 'cyl', rTop: 0.85, rBottom: 1.0, h: 0.25, y: 0.125 },
    { kind: 'cyl', rTop: 0.75, rBottom: 0.85, h: 0.15, y: 0.325 },
    { kind: 'cyl', rTop: 0.35, rBottom: 0.65, h: 0.9, y: 0.85 },
    { kind: 'cyl', rTop: 0.5, rBottom: 0.4, h: 0.1, y: 1.35 },
    { kind: 'sphere', r: 0.42, y: 1.65 },
  ],
  r: [
    { kind: 'cyl', rTop: 0.85, rBottom: 1.0, h: 0.25, y: 0.125 },
    { kind: 'cyl', rTop: 0.75, rBottom: 0.85, h: 0.15, y: 0.325 },
    { kind: 'cyl', rTop: 0.55, rBottom: 0.7, h: 1.2, y: 1.0 },
    { kind: 'cyl', rTop: 0.72, rBottom: 0.6, h: 0.35, y: 1.75 },
  ],
  n: [
    { kind: 'cyl', rTop: 0.85, rBottom: 1.0, h: 0.25, y: 0.125 },
    { kind: 'cyl', rTop: 0.75, rBottom: 0.85, h: 0.15, y: 0.325 },
    { kind: 'cyl', rTop: 0.45, rBottom: 0.7, h: 1.0, y: 0.9 },
    { kind: 'box', w: 0.55, h: 0.85, d: 0.9, y: 1.7 },
    { kind: 'box', w: 0.45, h: 0.45, d: 0.5, y: 1.72, z: 0.45 },
  ],
  b: [
    { kind: 'cyl', rTop: 0.85, rBottom: 1.0, h: 0.25, y: 0.125 },
    { kind: 'cyl', rTop: 0.75, rBottom: 0.85, h: 0.15, y: 0.325 },
    { kind: 'cyl', rTop: 0.35, rBottom: 0.65, h: 1.4, y: 1.1 },
    { kind: 'cyl', rTop: 0.55, rBottom: 0.4, h: 0.12, y: 1.86 },
    { kind: 'sphere', r: 0.48, y: 2.2 },
    { kind: 'sphere', r: 0.12, y: 2.62 },
  ],
  q: [
    { kind: 'cyl', rTop: 0.85, rBottom: 1.0, h: 0.25, y: 0.125 },
    { kind: 'cyl', rTop: 0.75, rBottom: 0.85, h: 0.15, y: 0.325 },
    { kind: 'cyl', rTop: 0.4, rBottom: 0.72, h: 1.8, y: 1.3 },
    { kind: 'cyl', rTop: 0.75, rBottom: 0.5, h: 0.4, y: 2.4 },
    { kind: 'sphere', r: 0.16, y: 2.72 },
  ],
  k: [
    { kind: 'cyl', rTop: 0.85, rBottom: 1.0, h: 0.25, y: 0.125 },
    { kind: 'cyl', rTop: 0.75, rBottom: 0.85, h: 0.15, y: 0.325 },
    { kind: 'cyl', rTop: 0.42, rBottom: 0.75, h: 2.0, y: 1.4 },
    { kind: 'cyl', rTop: 0.8, rBottom: 0.55, h: 0.45, y: 2.62 },
    { kind: 'box', w: 0.12, h: 0.42, d: 0.12, y: 3.05 },
    { kind: 'box', w: 0.32, h: 0.12, d: 0.12, y: 2.98 },
  ],
};

// ---------------------------------------------------------------------------
// Piece Component
// ---------------------------------------------------------------------------
interface SinglePieceProps {
  type: PieceType;
  color: PieceColor;
  position: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}

/**
 * Four materials for thirty-two pieces.
 *
 * Shared rather than built per piece: the old code made a fresh material
 * every time a piece was selected or deselected, which churned GPU programs
 * during ordinary play and never disposed the ones it replaced.
 *
 * The colours are chosen against the squares they stand on, not in isolation.
 * White is a warm pearl, clearly brighter than the ivory light square; black
 * is graphite rather than true black, so its form still catches the key light
 * while staying darker than the dark square. Neither is at the extremes,
 * which is what keeps both readable in daylight and under floodlights.
 */
export const PIECE_MATERIALS = {
  w: new MeshStandardMaterial({
    color: '#f7f2e7',
    roughness: 0.42,
    metalness: 0.06,
  }),
  b: new MeshStandardMaterial({
    color: '#2b2724',
    roughness: 0.38,
    metalness: 0.22,
  }),
  wSel: new MeshStandardMaterial({
    color: '#fff8e8',
    roughness: 0.38,
    metalness: 0.08,
    emissive: '#f0b429',
    // enough to pick the piece out, not enough to flare over the board
    emissiveIntensity: 0.22,
  }),
  bSel: new MeshStandardMaterial({
    color: '#34302c',
    roughness: 0.34,
    metalness: 0.24,
    emissive: '#38bdf8',
    emissiveIntensity: 0.28,
  }),
};

function SinglePiece({ type, color, position, isSelected, onClick }: SinglePieceProps) {
  const isWhite = color === 'w';
  const pieceMat = isSelected
    ? isWhite
      ? PIECE_MATERIALS.wSel
      : PIECE_MATERIALS.bSel
    : isWhite
      ? PIECE_MATERIALS.w
      : PIECE_MATERIALS.b;

  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Base for all pieces */}
      <mesh geometry={baseGeom} material={pieceMat} position={[0, 0.125, 0]} castShadow receiveShadow />
      <mesh geometry={basePedestalGeom} material={pieceMat} position={[0, 0.325, 0]} castShadow receiveShadow />

      {/* Pawn */}
      {type === 'p' && (
        <group position={[0, 0.4, 0]}>
          <mesh geometry={pawnBodyGeom} material={pieceMat} position={[0, 0.45, 0]} castShadow receiveShadow />
          <mesh geometry={pawnCollarGeom} material={pieceMat} position={[0, 0.95, 0]} castShadow receiveShadow />
          <mesh geometry={pawnHeadGeom} material={pieceMat} position={[0, 1.25, 0]} castShadow receiveShadow />
        </group>
      )}

      {/* Rook */}
      {type === 'r' && (
        <group position={[0, 0.4, 0]}>
          <mesh geometry={rookShaftGeom} material={pieceMat} position={[0, 0.6, 0]} castShadow receiveShadow />
          <mesh geometry={rookHeadGeom} material={pieceMat} position={[0, 1.35, 0]} castShadow receiveShadow />
          {/* Battlements */}
          <mesh geometry={rookCrenelGeom} material={pieceMat} position={[0.26, 1.55, 0.26]} castShadow />
          <mesh geometry={rookCrenelGeom} material={pieceMat} position={[-0.26, 1.55, 0.26]} castShadow />
          <mesh geometry={rookCrenelGeom} material={pieceMat} position={[0.26, 1.55, -0.26]} castShadow />
          <mesh geometry={rookCrenelGeom} material={pieceMat} position={[-0.26, 1.55, -0.26]} castShadow />
        </group>
      )}

      {/* Knight */}
      {type === 'n' && (
        <group position={[0, 0.4, 0]} rotation={[0, isWhite ? 0 : Math.PI, 0]}>
          <mesh geometry={knightBodyGeom} material={pieceMat} position={[0, 0.5, 0]} castShadow receiveShadow />
          <mesh geometry={knightHeadGeom} material={pieceMat} position={[0, 1.2, -0.1]} rotation={[0.2, 0, 0]} castShadow receiveShadow />
          <mesh geometry={knightSnoutGeom} material={pieceMat} position={[0, 1.05, 0.35]} castShadow receiveShadow />
        </group>
      )}

      {/* Bishop */}
      {type === 'b' && (
        <group position={[0, 0.4, 0]}>
          <mesh geometry={bishopBodyGeom} material={pieceMat} position={[0, 0.7, 0]} castShadow receiveShadow />
          <mesh geometry={bishopCollarGeom} material={pieceMat} position={[0, 1.45, 0]} castShadow receiveShadow />
          <mesh geometry={bishopHeadGeom} material={pieceMat} position={[0, 1.75, 0]} scale={[0.85, 1.2, 0.85]} castShadow receiveShadow />
          <mesh geometry={bishopFinialGeom} material={pieceMat} position={[0, 2.38, 0]} castShadow receiveShadow />
        </group>
      )}

      {/* Queen */}
      {type === 'q' && (
        <group position={[0, 0.4, 0]}>
          <mesh geometry={queenBodyGeom} material={pieceMat} position={[0, 0.9, 0]} castShadow receiveShadow />
          <mesh geometry={queenCoronetGeom} material={pieceMat} position={[0, 1.9, 0]} castShadow receiveShadow />
          <mesh geometry={queenBallGeom} material={pieceMat} position={[0, 2.2, 0]} castShadow receiveShadow />
        </group>
      )}

      {/* King */}
      {type === 'k' && (
        <group position={[0, 0.4, 0]}>
          <mesh geometry={kingBodyGeom} material={pieceMat} position={[0, 1.0, 0]} castShadow receiveShadow />
          <mesh geometry={kingCrownGeom} material={pieceMat} position={[0, 2.1, 0]} castShadow receiveShadow />
          {/* King Crown Cross */}
          <group position={[0, 2.5, 0]}>
            <mesh geometry={kingCrossVGeom} material={pieceMat} castShadow />
            <mesh geometry={kingCrossHGeom} material={pieceMat} position={[0, 0.05, 0]} castShadow />
          </group>
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// All 32 Pieces Container
// ---------------------------------------------------------------------------
export function ChessPieces() {
  const pieces = useGame((s) => s.pieces);
  const selectedSquare = useGame((s) => s.selectedSquare);
  const carry = useGame((s) => s.carry);
  const carrySample = useGame((s) => s.carrySample);
  const selectSquare = useGame((s) => s.selectSquare);

  // Separate captured pieces to compute tray index
  const whiteCaptured = useMemo(() => pieces.filter((p) => p.captured && p.color === 'w'), [pieces]);
  const blackCaptured = useMemo(() => pieces.filter((p) => p.captured && p.color === 'b'), [pieces]);

  return (
    <group>
      {pieces.map((p) => {
        const isCarried = carry?.pieceId === p.id && carrySample?.carrying;
        const isSelected = selectedSquare === p.square && !p.captured;

        let pos: [number, number, number];

        if (isCarried && carrySample) {
          // Attached to fly carry point
          pos = carrySample.piecePosition;
        } else if (p.captured) {
          // In sideline graveyard tray
          const list = p.color === 'w' ? whiteCaptured : blackCaptured;
          const idx = list.findIndex((c) => c.id === p.id);
          pos = capturedSlotWorld(p.color, Math.max(0, idx));
        } else {
          // On board square
          pos = squareToWorld(p.square);
        }

        return (
          <SinglePiece
            key={p.id}
            type={p.type}
            color={p.color}
            position={pos}
            isSelected={isSelected}
            onClick={() => {
              if (!p.captured) {
                selectSquare(p.square);
              }
            }}
          />
        );
      })}
    </group>
  );
}
