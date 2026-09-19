/**
 * Camera System for Drosophila Neural Chess.
 *
 * Provides presets: BOARD, WHITE, BLACK, PIECE, NEURAL, SPECTATOR, FREE.
 * Smoothly interpolates to the target view and supports full mouse/touch orbit.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Vector3 } from 'three';
import { BOARD } from '../board';
import { cameraFit } from './cameraFit';
import { BOWL_OUTER, BOWL_TOP } from './stadiumLayout';
import type { CameraPreset } from '../store';
import type { SeatId } from '../types';

interface Pose {
  position: Vector3;
  target: Vector3;
}

function poseFor(
  preset: CameraPreset,
  _seat: SeatId,
  focus: Vector3 | null,
  fit: { position: [number, number, number]; target: [number, number, number] },
): Pose {
  switch (preset) {
    case 'WHITE': {
      // Sat behind White, at about the height of a player leaning in
      return {
        position: new Vector3(0, 13.5, 24),
        target: new Vector3(0, 1.4, -1.5),
      };
    }

    case 'BLACK': {
      return {
        position: new Vector3(0, 13.5, -24),
        target: new Vector3(0, 1.4, 1.5),
      };
    }

    case 'PIECE': {
      const t = focus ?? new Vector3(0, 0, 0);
      return {
        position: new Vector3(t.x, t.y + 14, t.z + 16),
        target: new Vector3(t.x, t.y + 1.2, t.z),
      };
    }

    case 'NEURAL':
      return {
        position: new Vector3(0, 12, 16),
        target: new Vector3(0, 2.5, 0),
      };

    case 'SPECTATOR':
      return {
        position: new Vector3(BOWL_OUTER * 0.75, BOWL_TOP + 20, BOWL_OUTER * 0.75),
        target: new Vector3(0, 2, 0),
      };

    case 'FREE':
    case 'BOARD':
    default:
      /**
       * The default view, framed so the board is the subject.
       *
       * Measured, not guessed: the offline renderer reports the board's
       * projected size from a given pose, and this one puts it at 72% of
       * frame width and 62% of height on 16:9 -- inside the 60-75% the
       * design calls for, with enough margin at the corners for the player
       * cards and the move list to sit clear of the squares.
       *
       * Pulling in further looked better in isolation and was wrong: at
       * 0.90 board-lengths the frame cropped the outer files.
       *
       * The distance now comes from the viewport rather than a constant, so
       * the same framing holds on a phone in portrait as on a widescreen
       * monitor -- the board is always fully in shot.
       */
      return {
        position: new Vector3(...fit.position),
        target: new Vector3(...fit.target),
      };
  }
}

export function GameCamera({
  preset,
  seat,
  focusPoint,
  autoOrbit = false,
}: {
  preset: CameraPreset;
  seat: SeatId;
  focusPoint: Vector3 | null;
  autoOrbit?: boolean;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();

  // Recomputed whenever the canvas changes shape, so rotating a phone or
  // dragging a window reframes the board instead of cropping it.
  const fit = useMemo(() => {
    const fov = 'fov' in camera ? (camera as { fov: number }).fov : 44;
    return cameraFit((BOARD.size + 3.4) / 2, fov, size.width, size.height);
  }, [size.width, size.height, camera]);

  const currentPreset = useRef(preset);
  const currentSeat = useRef(seat);
  const animating = useRef(true);

  const desiredPos = useRef(new Vector3());
  const desiredTarget = useRef(new Vector3());

  // Trigger smooth transition whenever preset or seat changes
  useEffect(() => {
    currentPreset.current = preset;
    currentSeat.current = seat;
    const p = poseFor(preset, seat, focusPoint, fit);
    desiredPos.current.copy(p.position);
    desiredTarget.current.copy(p.target);
    animating.current = true;
  }, [preset, seat, focusPoint, fit]);

  useFrame((_, delta) => {
    if (!controls.current) return;

    if (preset === 'PIECE' && focusPoint) {
      const p = poseFor('PIECE', seat, focusPoint, fit);
      desiredPos.current.copy(p.position);
      desiredTarget.current.copy(p.target);
      animating.current = true;
    }

    if (animating.current && preset !== 'FREE') {
      const speed = Math.min(1, delta * 3.5);
      camera.position.lerp(desiredPos.current, speed);
      controls.current.target.lerp(desiredTarget.current, speed);
      controls.current.update();

      if (
        camera.position.distanceToSquared(desiredPos.current) < 0.05 &&
        controls.current.target.distanceToSquared(desiredTarget.current) < 0.05
      ) {
        animating.current = false;
      }
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      autoRotate={autoOrbit}
      autoRotateSpeed={0.6}
      minDistance={10}
      maxDistance={BOARD.outerRadius * 1.8}
      maxPolarAngle={Math.PI / 2 - 0.05}
      dampingFactor={0.06}
      enableDamping
    />
  );
}
