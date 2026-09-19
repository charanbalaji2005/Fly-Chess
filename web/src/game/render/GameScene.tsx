/**
 * The 3D Drosophila Neural Chess Scene.
 *
 * Championship stadium enclosing the 8x8 tournament chess board, 32 3D pieces,
 * Drosophila fly player mascots, spectator crowd, neural core, and dynamic sky.
 */

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping, Vector3 } from 'three';

import { BOARD } from '../board';
import { environmentFor } from '../environment';
import { useGame } from '../store';
import { BoardAnnotations } from './BoardAnnotations';
import { ChessBoardMesh } from './ChessBoardMesh';
import { ChessPieces } from './ChessPieces';
import { Crowd } from './Crowd';
import { FlyMascots } from './FlyMascots';
import { GameCamera } from './GameCamera';
import { NeuralCore } from './NeuralCore';
import { Sky } from './Sky';
import { Stadium } from './Stadium';

/**
 * The quality the scene actually runs at.
 *
 * A phone GPU asked for 2,800 shadow-casting spectators at devicePixelRatio
 * 3 will not hold 60fps, and the setting is about taste rather than
 * capability -- someone who picked High on their desktop should not be
 * punished for opening the same page on their phone. So the phone caps the
 * setting rather than overriding it, and the cap only ever reduces.
 *
 * What is protected is the board, the pieces and the fly. What gives way is
 * the crowd, the shadow map and the pixel ratio -- the background.
 */
function effectiveQuality(
  setting: 'LOW' | 'MEDIUM' | 'HIGH',
  width: number,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (width >= 1025) return setting;
  const cap = width < 600 ? 'LOW' : 'MEDIUM';
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
  return order[setting] <= order[cap] ? setting : cap;
}

export function GameScene() {
  const setting = useGame((s) => s.settings.quality);
  const env = environmentFor(useGame((s) => s.settings.environment));

  const width = typeof window === 'undefined' ? 1920 : window.innerWidth;
  const quality = effectiveQuality(setting, width);
  const mobile = width < 600;

  return (
    <Canvas
      shadows={quality === 'HIGH'}
      // a phone is already pushing pixels at 3x; capping at 2 costs almost
      // nothing visually and buys a lot of frame time
      dpr={quality === 'LOW' ? [1, mobile ? 1.5 : 1] : [1, 2]}
      gl={{
        antialias: quality !== 'LOW',
        powerPreference: 'high-performance',
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: env.exposure,
      }}
      camera={{
        fov: 44,
        near: 0.5,
        far: BOARD.outerRadius * 18,
        position: [0, BOARD.size * 1.0, BOARD.size * 1.2],
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={[env.sky.zenith]} />
      <fog
        attach="fog"
        args={[
          env.fog.color,
          BOARD.outerRadius * env.fog.nearScale,
          BOARD.outerRadius * env.fog.farScale,
        ]}
      />
      <SceneContents />
    </Canvas>
  );
}

function SceneContents() {
  const settings = useGame((s) => s.settings);
  const quality = effectiveQuality(
    settings.quality,
    typeof window === 'undefined' ? 1920 : window.innerWidth,
  );
  const currentSeat = useGame((s) => s.currentSeat);
  const camera = useGame((s) => s.camera);
  const screen = useGame((s) => s.screen);
  const carry = useGame((s) => s.carry);
  const carrySample = useGame((s) => s.carrySample);
  const crowd = useGame((s) => s.crowd);
  const neuralActivity = useGame((s) => s.neuralActivity);
  const decision = useGame((s) => s.decision);
  const pulses = useGame((s) => s.pulses);

  const env = environmentFor(settings.environment);

  // Seat indices for stadium banners (White = 0, Black = 1)
  const seats: (0 | 1)[] = [0, 1];

  // Dynamic focus point for camera follow
  const focusPoint = useMemo(() => {
    if (carry && carrySample && !carrySample.done) {
      return new Vector3(
        carrySample.flyPosition[0],
        carrySample.flyPosition[1],
        carrySample.flyPosition[2]
      );
    }
    return null;
  }, [carry, carrySample]);

  return (
    <>
      {/* --- Stadium Camera ------------------------------------------- */}
      <GameCamera
        preset={camera}
        seat={currentSeat}
        focusPoint={focusPoint}
        autoOrbit={screen === 'MENU'}
      />

      {/* --- Environment: Sky, Lights, Stadium, Crowd, Sky Jumbotron -- */}
      <Sky env={env} quality={quality} />
      <Stadium quality={quality} seats={seats as any} env={env} />
      <Crowd quality={quality} excitement={crowd.excitement} />

      {/* --- The Chess Arena ------------------------------------------ */}
      <ChessBoardMesh />
      <BoardAnnotations />
      <ChessPieces />
      <FlyMascots />

      {/* --- Neural Core Visualizer (Under / Near Board Center) -------- */}
      <NeuralCore
        activity={decision?.neuralActivity ?? null}
        pulses={pulses}
        excitement={neuralActivity * env.coreIntensity}
        enabled={settings.neuralVisuals}
      />
    </>
  );
}
