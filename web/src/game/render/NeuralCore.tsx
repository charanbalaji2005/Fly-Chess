/**
 * The Neural Core: the board's centre and its finishing square.
 *
 * Three nested shells standing for the three stages of the behaviour
 * pipeline -- sensory outside, central processing in the middle, decision at
 * the heart. Each shell's brightness is driven by that stage's actual
 * activation, so the core is showing the same numbers the brain panel shows
 * and the same ones that produced the move. It is a readout, not a lava lamp.
 *
 * SCIENTIFIC STATUS
 *   A gameplay visualisation. The particles are a seeded cloud, and what they
 *   display is the small hand-authored network in `neural/`, not the
 *   Drosophila connectome. The measured connectome -- 138,639 neurons -- and
 *   the spiking model this repository simulates are in the Neural Lab. The
 *   neural view panel says the same thing on screen.
 *
 * Built once from a fixed seed, so the core looks identical every match.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

import { BOARD } from '../board';
import { Rng } from '../rng';
import type { CorePulse } from '../store';
import { EMPTY_ACTIVITY, type NeuralActivity } from '../neural/types';

const CORE_SEED = 0x5eed;
/** Neurons per shell: sensory, central, decision. */
const SHELL_COUNTS = [150, 110, 60];
const NEIGHBOURS = 2;

// ---------------------------------------------------------------------------
// cloud
// ---------------------------------------------------------------------------

function buildShell(count: number, radius: number, squash: number, seed: number) {
  const rng = new Rng(seed);
  const points: Vector3[] = [];

  for (let i = 0; i < count; i++) {
    // sample the shell, not the ball, so each layer reads as a layer
    const u = rng.float() * 2 - 1;
    const theta = rng.float() * Math.PI * 2;
    const r = radius * (0.86 + rng.float() * 0.14);
    const s = Math.sqrt(1 - u * u);
    points.push(new Vector3(r * s * Math.cos(theta), r * u * squash, r * s * Math.sin(theta)));
  }

  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  points.forEach((p, i) => {
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    seeds[i] = rng.float();
  });

  // join each node to its nearest few, which turns dust into a network
  const lines: number[] = [];
  for (let i = 0; i < count; i++) {
    const near = points
      .map((p, j) => ({ j, d: p.distanceToSquared(points[i]) }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEIGHBOURS);
    for (const { j } of near) {
      if (j < i) continue;
      lines.push(
        points[i].x, points[i].y, points[i].z,
        points[j].x, points[j].y, points[j].z,
      );
    }
  }

  return { positions, seeds, lines: new Float32Array(lines) };
}

function nodeMaterial(tint: [number, number, number]) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uSize: { value: 74 },
      uTint: { value: tint },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uLevel;
      uniform float uSize;
      varying float vGlow;

      void main() {
        float phase = aSeed * 6.2831;
        float twinkle = 0.5 + 0.5 * sin(uTime * (1.3 + aSeed * 2.4) + phase);
        vGlow = mix(0.2, 1.0, twinkle) * (0.3 + uLevel * 1.1);

        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.5 + vGlow * 0.9) / max(1.0, -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      varying float vGlow;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float falloff = pow(1.0 - r * 2.0, 2.2);
        gl_FragColor = vec4(uTint * falloff * (0.6 + vGlow), falloff * vGlow);
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

/**
 * Beyond the north edge of the board and lifted clear of it.
 *
 * `BOARD.size / 2` is the board edge; this sits a further two cells out and
 * well above the pieces, so no camera angle puts it between the player and a
 * square.
 */
const CORE_POSITION: [number, number, number] = [0, 9.5, -(BOARD.size / 2 + 7.5)];

export function NeuralCore({
  activity,
  pulses,
  excitement,
  enabled = true,
}: {
  /** The live pipeline readout; each shell tracks one stage of it. */
  activity: NeuralActivity | null;
  pulses: CorePulse[];
  /** 0..1 overall event energy, decaying. */
  excitement: number;
  enabled?: boolean;
}) {
  const a = activity ?? EMPTY_ACTIVITY;

  // mean of each pipeline stage, which is what each shell displays
  const levels = useMemo(
    () => [
      mean(a.sensory),
      mean(a.central),
      Math.max(...a.decision, 0) * a.motor,
    ],
    [a],
  );

  const group = useRef<Group>(null);
  const shell = useRef<Mesh>(null);

  /**
   * Sized and placed to stay off the board.
   *
   * It used to sit at the board's centre at full size, glowing over the four
   * middle squares -- the ones that decide most games. It is now a smaller,
   * dimmer instrument floating beyond the north edge, past Black's back
   * rank, where it is still clearly part of the arena and cannot obscure a
   * piece, a legal-move marker or a coordinate.
   */
  const radius = BOARD.coreRadius * 0.62;
  const shells = useMemo(
    () => [
      { ...buildShell(SHELL_COUNTS[0], radius * 1.0, 0.7, CORE_SEED), tint: [0.32, 0.72, 1.0] },
      { ...buildShell(SHELL_COUNTS[1], radius * 0.68, 0.8, CORE_SEED + 1), tint: [0.45, 0.95, 0.85] },
      { ...buildShell(SHELL_COUNTS[2], radius * 0.36, 0.9, CORE_SEED + 2), tint: [1.0, 0.82, 0.45] },
    ],
    [radius],
  );

  const geometries = useMemo(
    () =>
      shells.map((s) => {
        const nodes = new BufferGeometry();
        nodes.setAttribute('position', new BufferAttribute(s.positions, 3));
        nodes.setAttribute('aSeed', new BufferAttribute(s.seeds, 1));
        const links = new BufferGeometry();
        links.setAttribute('position', new BufferAttribute(s.lines, 3));
        return { nodes, links };
      }),
    [shells],
  );

  const materials = useMemo(
    () => shells.map((s) => nodeMaterial(s.tint as [number, number, number])),
    [shells],
  );

  const shellRefs = useRef<(Points | null)[]>([null, null, null]);

  useFrame((_, delta) => {
    if (!enabled) return;

    if (group.current) group.current.rotation.y += delta * 0.14;

    materials.forEach((m, i) => {
      m.uniforms.uTime.value += delta;
      const want = levels[i];
      m.uniforms.uLevel.value += (want - m.uniforms.uLevel.value) * Math.min(1, delta * 5);
    });

    // counter-rotate the inner shells, so the layers read as separate
    shellRefs.current.forEach((node, i) => {
      if (node) node.rotation.y -= delta * 0.08 * (i + 1);
    });

    if (shell.current) {
      const breathe = 1 + Math.sin(performance.now() * 0.0015) * 0.02 + excitement * 0.06;
      shell.current.scale.setScalar(breathe);
      const mat = shell.current.material as { emissiveIntensity?: number };
      if (mat.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = 0.45 + excitement * 1.6;
      }
    }
  });

  if (!enabled) {
    return (
      <mesh position={[0, radius * 0.7, 0]}>
        <icosahedronGeometry args={[radius * 0.7, 1]} />
        <meshStandardMaterial color="#2a4055" roughness={0.4} metalness={0.5} />
      </mesh>
    );
  }

  return (
    <group name="neural-core" position={CORE_POSITION}>
      <group ref={group}>
        {/* outer glass */}
        <mesh ref={shell}>
          <icosahedronGeometry args={[radius * 1.12, 3]} />
          <meshStandardMaterial
            color="#12303f"
            emissive="#2ba7d8"
            emissiveIntensity={0.42}
            transparent
            opacity={0.1}
            roughness={0.2}
            metalness={0.1}
          />
        </mesh>

        {geometries.map((g, i) => (
          <group key={i}>
            <lineSegments geometry={g.links}>
              <lineBasicMaterial
                color={i === 2 ? '#ffd88f' : i === 1 ? '#6fe6d2' : '#4aa8e8'}
                transparent
                opacity={0.14 + levels[i] * 0.4}
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </lineSegments>
            <points
              ref={(node) => {
                shellRefs.current[i] = node;
              }}
              geometry={g.nodes}
              material={materials[i]}
            />
          </group>
        ))}
      </group>

      {/* a mounting ring, edge-on to the board so it reads as an instrument
          on a stand rather than a halo lying on the squares */}
      <mesh position={[0, -radius * 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.9, radius * 1.05, 48]} />
        <meshStandardMaterial
          color="#5fd8ff"
          emissive="#5fd8ff"
          emissiveIntensity={0.25 + excitement * 0.7}
          transparent
          opacity={0.55}
          toneMapped={false}
        />
      </mesh>

      {pulses.map((pulse) => (
        <Pulse key={pulse.key} pulse={pulse} baseY={-radius * 1.5} />
      ))}

      <pointLight intensity={16 + excitement * 55} distance={30} color="#63d6ff" />
    </group>
  );
}

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/**
 * Expanding shockwave when a piece reaches the core.
 *
 * Fades as it grows; the store retires it on a timer, so a long match cannot
 * accumulate rings.
 */
function Pulse({ pulse, baseY }: { pulse: CorePulse; baseY: number }) {
  const ref = useRef<Mesh>(null);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const age = (performance.now() - pulse.startedAt) / 2000;
    if (age < 0 || age > 1) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const eased = 1 - Math.pow(1 - age, 2.4);
    mesh.scale.setScalar(1 + eased * 9 * pulse.strength);
    (mesh.material as { opacity: number }).opacity = (1 - age) * 0.45;
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, baseY + 0.06, 0]}>
      <ringGeometry args={[BOARD.coreRadius * 0.9, BOARD.coreRadius * 1.04, 52]} />
      <meshBasicMaterial
        color="#8fe6ff"
        transparent
        opacity={0.45}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
