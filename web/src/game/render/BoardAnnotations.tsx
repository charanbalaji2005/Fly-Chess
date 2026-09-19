/**
 * What the board says about itself.
 *
 * The point of this module: **a player should never have to read a panel to
 * know what just happened.** Every fact about the current position that a
 * person would otherwise look up -- which move was last played, whether it
 * took something, whether the king is in check -- is drawn on the squares
 * those facts belong to.
 *
 * That matters most on a phone, where there is no room for panels, but it is
 * the right answer everywhere: the board is the thing the player is already
 * looking at.
 *
 * Everything here is 3D and board-relative, positioned from
 * `squareToWorld`, so it stays registered to the squares under any camera
 * angle, orbit or zoom. Text and numbers stay in the DOM; geometry stays
 * here. The two never mix.
 *
 * Nothing in this file decides anything. Every annotation is read from the
 * engine's own state -- `moveHistory`, `status.inCheck`, `captured` -- so
 * the board cannot show a check the engine does not report or a move the
 * engine did not make.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';

import { CHESS_BOARD, squareToWorld, type Square } from '../chessEngine';
import { useGame } from '../store';

/** Just above the tiles, below the pieces' bases. */
const LAYER = CHESS_BOARD.deckY + 0.055;

/** How long the arrow and the capture flash stay up. */
const ARROW_MS = 1700;
const FLASH_MS = 900;

const FROM_COLOR = '#7dd3fc';
const TO_COLOR = '#38bdf8';
const CAPTURE_COLOR = '#fb7185';
const CHECK_COLOR = '#f43f5e';

export function BoardAnnotations() {
  const moveHistory = useGame((s) => s.moveHistory);
  const lastMoveAt = useGame((s) => s.lastMoveAt);
  const status = useGame((s) => s.status);
  const turn = useGame((s) => s.turn);
  const pieces = useGame((s) => s.pieces);
  const carry = useGame((s) => s.carry);
  const winner = useGame((s) => s.winner);

  const last = moveHistory[moveHistory.length - 1] ?? null;

  /**
   * On checkmate the board says so too.
   *
   * The mated king keeps its red outline (the engine still reports check),
   * and the winning king is haloed -- so a glance at the board answers
   * "who won" without reading the overlay, and the position that produced
   * the result stays legible behind it.
   */
  const winningKing = useMemo<Square | null>(() => {
    if (!status.isCheckmate || winner === null) return null;
    const colour = winner === 0 ? 'w' : 'b';
    const king = pieces.find((p) => p.type === 'k' && p.color === colour && !p.captured);
    return king?.square ?? null;
  }, [status.isCheckmate, winner, pieces]);

  // The king actually in check, per the engine. Not inferred.
  const checkSquare = useMemo<Square | null>(() => {
    if (!status.inCheck) return null;
    const king = pieces.find((p) => p.type === 'k' && p.color === turn && !p.captured);
    return king?.square ?? null;
  }, [status.inCheck, turn, pieces]);

  // While a piece is in the air its destination is not yet the truth, so the
  // previous move's marks come down as soon as the next one starts.
  const showLast = last && !carry;

  return (
    <group name="board-annotations">
      {showLast && (
        <>
          <SquareMark square={last.from} color={FROM_COLOR} opacity={0.22} />
          <SquareMark
            square={last.to}
            color={last.isCapture ? CAPTURE_COLOR : TO_COLOR}
            opacity={last.isCapture ? 0.4 : 0.34}
            ring
          />
          <MoveArrow
            from={last.from}
            to={last.to}
            at={lastMoveAt}
            color={last.isCapture ? CAPTURE_COLOR : TO_COLOR}
            strong={last.isCapture || last.isCheck}
          />
          {last.isCapture && <CaptureFlash square={last.to} at={lastMoveAt} />}
        </>
      )}

      {checkSquare && <CheckPulse square={checkSquare} />}
      {winningKing && <VictoryHalo square={winningKing} />}
    </group>
  );
}

// ---------------------------------------------------------------------------
// a marked square
// ---------------------------------------------------------------------------

function SquareMark({
  square,
  color,
  opacity,
  ring = false,
}: {
  square: Square;
  color: string;
  opacity: number;
  ring?: boolean;
}) {
  const p = squareToWorld(square);
  const cell = CHESS_BOARD.cellSize;

  return (
    <group position={[p[0], LAYER, p[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[cell * 0.98, cell * 0.98]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* the destination also gets a border, so the two ends of the move are
          distinguishable at a glance rather than only by brightness */}
      {ring && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
          <ringGeometry args={[cell * 0.44, cell * 0.49, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.9}
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
// the arrow
// ---------------------------------------------------------------------------

/**
 * A thin shaft from origin to destination, with a head.
 *
 * Built once per move and faded out by the frame loop rather than by React
 * state, so a fading arrow costs no re-renders. It lies just above the
 * squares and is short-lived: the square marks are what persist.
 */
function MoveArrow({
  from,
  to,
  at,
  color,
  strong,
}: {
  from: Square;
  to: Square;
  at: number;
  color: string;
  strong: boolean;
}) {
  const group = useRef<Group>(null);
  const shaft = useRef<Mesh>(null);
  const head = useRef<Mesh>(null);

  const geometry = useMemo(() => {
    const a = squareToWorld(from);
    const b = squareToWorld(to);
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dz);
    // stop short of both squares' centres so the arrow points between them
    // rather than burying its ends under the pieces
    const inset = CHESS_BOARD.cellSize * 0.3;
    return {
      mid: [(a[0] + b[0]) / 2, LAYER + 0.02, (a[2] + b[2]) / 2] as [number, number, number],
      angle: Math.atan2(dx, dz),
      shaftLength: Math.max(0.1, length - inset * 2),
      headAt: Math.max(0.05, length / 2 - inset),
    };
  }, [from, to]);

  useFrame(() => {
    const node = group.current;
    if (!node) return;
    const age = (performance.now() - at) / ARROW_MS;

    if (age >= 1) {
      node.visible = false;
      return;
    }
    node.visible = true;

    // quick in, hold, slow out
    const fade = age < 0.12 ? age / 0.12 : 1 - Math.max(0, (age - 0.55) / 0.45);
    const opacity = Math.max(0, fade) * (strong ? 0.85 : 0.6);

    if (shaft.current) (shaft.current.material as MeshBasicMaterial).opacity = opacity;
    if (head.current) (head.current.material as MeshBasicMaterial).opacity = opacity;
  });

  const width = strong ? 0.34 : 0.24;

  return (
    <group ref={group} position={geometry.mid} rotation={[0, geometry.angle, 0]}>
      <mesh ref={shaft} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, geometry.shaftLength]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0}
          side={DoubleSide}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh
        ref={head}
        position={[0, 0, geometry.headAt]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[width * 2.1, 3]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0}
          side={DoubleSide}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// capture and check
// ---------------------------------------------------------------------------

/** A ring that expands off the square something was taken on. */
function CaptureFlash({ square, at }: { square: Square; at: number }) {
  const mesh = useRef<Mesh>(null);
  const p = squareToWorld(square);

  useFrame(() => {
    const node = mesh.current;
    if (!node) return;
    const age = (performance.now() - at) / FLASH_MS;
    if (age >= 1) {
      node.visible = false;
      return;
    }
    node.visible = true;
    const eased = 1 - Math.pow(1 - age, 2);
    node.scale.setScalar(0.5 + eased * 1.8);
    (node.material as MeshBasicMaterial).opacity = (1 - age) * 0.75;
  });

  return (
    <mesh ref={mesh} position={[p[0], LAYER + 0.01, p[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[CHESS_BOARD.cellSize * 0.3, CHESS_BOARD.cellSize * 0.42, 32]} />
      <meshBasicMaterial
        color={CAPTURE_COLOR}
        transparent
        opacity={0}
        side={DoubleSide}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/** A slow gold halo under the king that delivered mate. */
function VictoryHalo({ square }: { square: Square }) {
  const mesh = useRef<Mesh>(null);
  const p = squareToWorld(square);
  const cell = CHESS_BOARD.cellSize;

  useFrame(({ clock }) => {
    const node = mesh.current;
    if (!node) return;
    const t = clock.elapsedTime;
    (node.material as MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 1.8) * 0.2;
    node.rotation.z = t * 0.35;
  });

  return (
    <mesh position={[p[0], LAYER + 0.015, p[2]]} rotation={[-Math.PI / 2, 0, 0]} ref={mesh}>
      <ringGeometry args={[cell * 0.42, cell * 0.56, 48]} />
      <meshBasicMaterial
        color="#f0b429"
        transparent
        opacity={0.5}
        side={DoubleSide}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * The king's square while it is in check.
 *
 * Present for exactly as long as the engine reports check, and pulsing
 * rather than static so it reads as an alarm without needing to be loud.
 * It is an outline: the king has to stay visible, since it is the piece the
 * player now has to do something about.
 */
function CheckPulse({ square }: { square: Square }) {
  const mesh = useRef<Mesh>(null);
  const p = squareToWorld(square);
  const cell = CHESS_BOARD.cellSize;

  useFrame(({ clock }) => {
    const node = mesh.current;
    if (!node) return;
    const beat = 0.55 + Math.sin(clock.elapsedTime * 4.2) * 0.35;
    (node.material as MeshBasicMaterial).opacity = beat;
    node.scale.setScalar(0.97 + Math.sin(clock.elapsedTime * 4.2) * 0.04);
  });

  return (
    <mesh ref={mesh} position={[p[0], LAYER + 0.02, p[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[cell * 0.38, cell * 0.49, 4, 1, Math.PI / 4]} />
      <meshBasicMaterial
        color={CHECK_COLOR}
        transparent
        opacity={0.8}
        side={DoubleSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
