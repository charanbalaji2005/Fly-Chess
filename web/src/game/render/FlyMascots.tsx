/**
 * Drosophila Chess Player Mascots (White & Black).
 *
 * Each side is represented by an anatomical Drosophila fly player perched on its station.
 * When making a move, the fly physically lifts off, flies to the piece, grabs it,
 * carries it along an arc trajectory to the target square, places it down, and returns.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
import { seatStation } from '../board';
import { SEAT_COLORS, ACCENT_HEX } from '../rules';
import type { SeatId } from '../types';
import { flyGeometry } from '../../three/geometry/flyGeometry';
import { useGame } from '../store';

const AVATAR_SCALE = 0.24;

interface MascotProps {
  seat: SeatId;
  active: boolean;
  won: boolean;
  geometry: ReturnType<typeof flyGeometry>;
  materials: Record<string, MeshStandardMaterial>;
}

function Mascot({ seat, active, won, geometry, materials }: MascotProps) {
  const flier = useRef<Group>(null);
  const wingsL = useRef<Group>(null);
  const wingsR = useRef<Group>(null);
  const halo = useRef<Mesh>(null);

  const carry = useGame((s) => s.carry);
  const carrySample = useGame((s) => s.carrySample);

  const station = useMemo(() => seatStation(seat), [seat]);
  const colorKey = SEAT_COLORS[seat];
  const accent = ACCENT_HEX[colorKey];

  useFrame(({ clock }) => {
    const node = flier.current;
    if (!node) return;

    const t = clock.elapsedTime;
    const isCarrying = carry && carry.seat === seat && carrySample && !carrySample.done;

    if (isCarrying && carrySample) {
      // Physically driving piece carry
      node.position.set(
        carrySample.flyPosition[0],
        carrySample.flyPosition[1],
        carrySample.flyPosition[2]
      );
      node.rotation.set(
        carrySample.flyPitch,
        carrySample.flyFacing,
        carrySample.flyRoll
      );

      // High-speed wing flutter during flight
      const flap = Math.sin(t * 70) * 0.45;
      if (wingsL.current) wingsL.current.rotation.z = flap;
      if (wingsR.current) wingsR.current.rotation.z = -flap;
    } else {
      // Perched at player station
      const hoverY = won ? 4.5 + Math.sin(t * 4) * 0.4 : station[1] + Math.sin(t * 2.5) * 0.12;
      node.position.set(station[0], hoverY, station[2]);

      // Facing towards the board center (0, 0, 0)
      const facing = Math.atan2(-station[0], -station[2]);
      node.rotation.set(0, facing, 0);

      // Gentle resting wing flutter
      const flap = Math.sin(t * (active ? 20 : 6)) * (active ? 0.2 : 0.08);
      if (wingsL.current) wingsL.current.rotation.z = flap;
      if (wingsR.current) wingsR.current.rotation.z = -flap;
    }

    // Halo pulse when active turn
    if (halo.current) {
      halo.current.rotation.z = t * 0.8;
      const s = 1.0 + Math.sin(t * 4) * 0.08;
      halo.current.scale.set(s, s, s);
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* --- Player Station Plinth ------------------------------------ */}
      <group position={station}>
        {/* Stone Column Base */}
        <mesh position={[0, -1.2, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[2.4, 2.8, 2.2, 32]} />
          <meshStandardMaterial color="#1a1816" roughness={0.45} metalness={0.2} />
        </mesh>

        {/* Glowing Turn Indicator Ring */}
        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.0, 2.4, 32]} />
          <meshBasicMaterial
            color={accent}
            transparent
            opacity={active ? 0.9 : 0.25}
          />
        </mesh>
      </group>

      {/* --- Drosophila Fly Mesh -------------------------------------- */}
      <group ref={flier} scale={AVATAR_SCALE}>
        {/* Active Player Aura */}
        {active && (
          <mesh ref={halo} position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[5.2, 5.8, 32]} />
            <meshBasicMaterial color={accent} transparent opacity={0.6} side={DoubleSide} />
          </mesh>
        )}

        {/* Fly Anatomical Geometry */}
        <group position={[0, 0, 0]}>
          <mesh geometry={geometry.head} material={materials.cuticle} castShadow receiveShadow />
          <mesh geometry={geometry.eyeL} material={materials.eye} />
          <mesh geometry={geometry.eyeR} material={materials.eye} />
          <mesh geometry={geometry.proboscis} material={materials.cuticle} />
          <mesh geometry={geometry.antennae} material={materials.legs} />
          <mesh geometry={geometry.thorax} material={materials.thorax} castShadow receiveShadow />
          <mesh geometry={geometry.abdomen} material={materials.abdomen} castShadow receiveShadow />
          <mesh geometry={geometry.legs} material={materials.legs} castShadow />

          {/* Wings */}
          <group ref={wingsL} position={[0, 1.2, 0]}>
            <mesh geometry={geometry.wingL} material={materials.wing} />
          </group>
          <group ref={wingsR} position={[0, 1.2, 0]}>
            <mesh geometry={geometry.wingR} material={materials.wing} />
          </group>
        </group>
      </group>
    </group>
  );
}

export function FlyMascots() {
  const currentSeat = useGame((s) => s.currentSeat);
  const winner = useGame((s) => s.winner);

  const geometry = useMemo(() => flyGeometry(), []);

  const materials = useMemo(
    () => ({
      cuticle: new MeshStandardMaterial({ color: '#8a6a3f', roughness: 0.48, metalness: 0.13 }),
      thorax: new MeshStandardMaterial({ color: '#7d5c35', roughness: 0.44, metalness: 0.15 }),
      abdomen: new MeshStandardMaterial({ color: '#4f3a21', roughness: 0.6 }),
      legs: new MeshStandardMaterial({ color: '#6b4f2e', roughness: 0.7 }),
      eye: new MeshStandardMaterial({
        color: '#a33025',
        emissive: '#5a160f',
        emissiveIntensity: 0.55,
        roughness: 0.26,
      }),
      wing: new MeshStandardMaterial({
        color: '#e2eefb',
        transparent: true,
        opacity: 0.28,
        side: DoubleSide,
        depthWrite: false,
        roughness: 0.1,
      }),
    }),
    []
  );

  return (
    <group name="fly-mascots">
      {/* White Player Mascot */}
      <Mascot
        seat={0}
        active={currentSeat === 0}
        won={winner === 0}
        geometry={geometry}
        materials={materials}
      />
      {/* Black Player Mascot */}
      <Mascot
        seat={1}
        active={currentSeat === 1}
        won={winner === 1}
        geometry={geometry}
        materials={materials}
      />
    </group>
  );
}
