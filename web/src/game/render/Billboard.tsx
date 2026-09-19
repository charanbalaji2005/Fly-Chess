/**
 * The Floating Aerial Sky Jumbotron for Drosophila Neural Chess.
 *
 * Suspended high in the stadium air above the northern rim of the arena,
 * tilted downward toward the board and camera. Hovering with subtle anti-gravity
 * physics and thruster plumes, it serves as the ultimate broadcast sky screen:
 * showing the last move, what's next, AI hardness level, clocks, and move history.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CanvasTexture,
  DoubleSide,
  Group,
  LinearFilter,
  MeshBasicMaterial,
  SRGBColorSpace,
} from 'three';

import { useGame } from '../store';
import { SCREEN_H, SCREEN_W, paintBillboard } from './billboardCanvas';
import { billboardData } from './billboardData';

/** How long the move result takes to slide in (ms) */
const REVEAL_MS = 500;

export function Billboard() {
  const groupRef = useRef<Group>(null);

  const players = useGame((s) => s.players);
  const clocks = useGame((s) => s.clocks);
  const timePreset = useGame((s) => s.config.timePreset);
  const turn = useGame((s) => s.turn);
  const moveHistory = useGame((s) => s.moveHistory);
  const status = useGame((s) => s.status);
  const winner = useGame((s) => s.winner);
  const aiThinking = useGame((s) => s.aiThinking);
  const aiMetrics = useGame((s) => s.aiMetrics);
  const lastMoveAt = useGame((s) => s.lastMoveAt);

  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = SCREEN_W;
    c.height = SCREEN_H;
    return c;
  }, []);

  const texture = useMemo(() => {
    const t = new CanvasTexture(canvas);
    t.minFilter = LinearFilter;
    t.magFilter = LinearFilter;
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [canvas]);

  const data = useMemo(
    () =>
      billboardData({
        players,
        clocks,
        timed: timePreset !== 'CASUAL',
        turn,
        moveHistory,
        status,
        winner,
        aiThinking,
        aiMetrics,
      }),
    [players, clocks, timePreset, turn, moveHistory, status, winner, aiThinking, aiMetrics],
  );

  // Repaint canvas when game data changes
  const painted = useRef(-1);
  useEffect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintBillboard(ctx, data, 1);
    texture.needsUpdate = true;
    painted.current = -1;
  }, [data, canvas, texture]);

  // Handle slide animation and gentle anti-gravity hovering
  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // Subtle anti-gravity bobbing and breathing motion
    if (groupRef.current) {
      groupRef.current.position.y = 26.5 + Math.sin(t * 1.3) * 0.35;
      groupRef.current.rotation.z = Math.sin(t * 0.75) * 0.006;
      groupRef.current.rotation.x = 0.24 + Math.sin(t * 0.9) * 0.004;
    }

    // Move reveal slide
    if (lastMoveAt) {
      const age = performance.now() - lastMoveAt;
      if (age <= REVEAL_MS) {
        const step = Math.floor(age / 32);
        if (step !== painted.current) {
          painted.current = step;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            paintBillboard(ctx, data, Math.min(1, age / REVEAL_MS));
            texture.needsUpdate = true;
          }
        }
      }
    }
  });

  const screenMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        map: texture,
        side: DoubleSide,
        toneMapped: false,
      }),
    [texture],
  );

  const screenW = 36;
  const screenH = 13.5;
  const halfW = screenW / 2;

  return (
    <group ref={groupRef} name="flying-jumbotron" position={[0, 26.5, -38]} rotation={[0.24, 0, 0]}>
      {/* 1. Emissive High-Res Broadcast Display */}
      <mesh material={screenMaterial} position={[0, 0, 0]}>
        <planeGeometry args={[screenW, screenH]} />
      </mesh>

      {/* 2. Sleek Metallic Chassis Bezel around the screen */}
      {/* Top & Bottom Bezel Rails */}
      {[-screenH / 2 - 0.45, screenH / 2 + 0.45].map((y, idx) => (
        <group key={idx} position={[0, y, -0.2]}>
          <mesh castShadow>
            <boxGeometry args={[screenW + 2.2, 0.9, 1.2]} />
            <meshStandardMaterial color="#111827" roughness={0.4} metalness={0.8} />
          </mesh>
          {/* Glowing Neon Bezel Edge */}
          <mesh position={[0, idx === 0 ? 0.35 : -0.35, 0.55]}>
            <boxGeometry args={[screenW + 2.2, 0.12, 0.15]} />
            <meshBasicMaterial color="#38bdf8" toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Left & Right Bezel Frames */}
      {[-halfW - 0.55, halfW + 0.55].map((x, idx) => (
        <mesh key={idx} position={[x, 0, -0.2]} castShadow>
          <boxGeometry args={[1.1, screenH + 1.8, 1.2]} />
          <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.8} />
        </mesh>
      ))}

      {/* 3. Aerodynamic Floating Craft Hull Backing (Mounted behind the screen) */}
      <mesh position={[0, 0, -1.0]} castShadow>
        <boxGeometry args={[screenW + 1.8, screenH + 1.2, 1.6]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.5} />
      </mesh>

      {/* Structural Central Spine on Back */}
      <mesh position={[0, 0, -2.0]} castShadow>
        <boxGeometry args={[screenW * 0.7, screenH * 0.6, 1.2]} />
        <meshStandardMaterial color="#090d16" roughness={0.7} metalness={0.6} />
      </mesh>

      {/* 4. Anti-Gravity Thruster Pods (4 Corner Ion Engines) */}
      {[-halfW + 3, halfW - 3].map((tx, ix) =>
        [-0.8].map((tz, iz) => (
          <group key={`${ix}-${iz}`} position={[tx, -screenH / 2 - 1.2, tz]}>
            {/* Thruster Nacelle Cylinder */}
            <mesh castShadow>
              <cylinderGeometry args={[1.1, 1.3, 1.8, 24]} />
              <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.85} />
            </mesh>

            {/* Glowing Ion Exhaust Nozzle Ring */}
            <mesh position={[0, -0.95, 0]}>
              <cylinderGeometry args={[0.9, 1.15, 0.25, 24]} />
              <meshBasicMaterial color="#38bdf8" toneMapped={false} />
            </mesh>

            {/* Inner Intense Thruster Core */}
            <mesh position={[0, -1.05, 0]}>
              <cylinderGeometry args={[0.6, 0.8, 0.2, 16]} />
              <meshBasicMaterial color="#e0f2fe" toneMapped={false} />
            </mesh>

            {/* Downward Anti-Gravity Thruster Plume Light */}
            <pointLight
              position={[0, -1.8, 0]}
              intensity={160}
              distance={35}
              decay={1.8}
              color="#38bdf8"
            />
          </group>
        )),
      )}

      {/* 5. Telemetry & Beacon Masts (Top Antennae with Strobe Tips) */}
      {[-halfW + 4, 0, halfW - 4].map((ax, idx) => (
        <group key={idx} position={[ax, screenH / 2 + 1.2, -0.6]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.08, 0.12, 2.2, 8]} />
            <meshStandardMaterial color="#64748b" roughness={0.4} metalness={0.8} />
          </mesh>
          {/* Strobe Beacon Tip */}
          <mesh position={[0, 1.2, 0]}>
            <sphereGeometry args={[0.22, 12, 12]} />
            <meshBasicMaterial color={idx === 1 ? '#38bdf8' : '#f43f5e'} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* 6. Downward Arena Floodlight from Jumbotron to Pitch */}
      <spotLight
        position={[0, -screenH / 2, 0]}
        target-position={[0, 0, 10]}
        angle={0.65}
        penumbra={0.8}
        intensity={350}
        distance={70}
        decay={1.6}
        color="#bae6fd"
      />
    </group>
  );
}
