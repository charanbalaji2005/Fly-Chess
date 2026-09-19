/**
 * The sky the stadium stands under.
 *
 * A gradient dome, a light source disc, drifting billboard clouds, and -- at
 * night -- stars and a moon. Every colour and count comes from the
 * environment preset, so day and night are the same objects with different
 * numbers rather than two scenes.
 *
 * The budget is deliberately small: the dome is one shader, the clouds are
 * one instanced quad, the stars are one Points. The instances belong to the
 * crowd below, not up here.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  ShaderMaterial,
} from 'three';

import { BOARD } from '../board';
import { Rng } from '../rng';
import type { EnvironmentPreset } from '../environment';

/** Far enough out that nothing in the stadium can reach it. */
const DOME_RADIUS = BOARD.outerRadius * 7;

// ---------------------------------------------------------------------------
// dome
// ---------------------------------------------------------------------------

/**
 * Sky gradient.
 *
 * Three bands mixed by height, with a broad glow around the light direction
 * so the illumination in the scene has a visible source. The uniforms are
 * mutated on a preset change rather than the material being rebuilt, which
 * avoids a shader recompile mid-match.
 */
function SkyDome({ env }: { env: EnvironmentPreset }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: {
          uHorizon: { value: new Color(env.sky.horizon) },
          uMid: { value: new Color(env.sky.mid) },
          uZenith: { value: new Color(env.sky.zenith) },
          uGlow: { value: new Color(env.glow) },
          uLightDir: { value: env.lightDirection },
          uGlowStrength: { value: env.mode === 'SUN' ? 1 : 0.35 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uHorizon;
          uniform vec3 uMid;
          uniform vec3 uZenith;
          uniform vec3 uGlow;
          uniform vec3 uLightDir;
          uniform float uGlowStrength;
          varying vec3 vDir;

          void main() {
            float h = clamp(vDir.y, -1.0, 1.0);
            // two mixes, so the horizon haze stays tight and the upper sky
            // does not wash out
            vec3 sky = mix(uHorizon, uMid, smoothstep(-0.05, 0.35, h));
            sky = mix(sky, uZenith, smoothstep(0.3, 0.95, h));

            float d = max(0.0, dot(normalize(vDir), normalize(uLightDir)));
            sky += uGlow * pow(d, 8.0) * 0.35 * uGlowStrength;
            sky += uGlow * pow(d, 220.0) * 1.6 * uGlowStrength;

            // darken below the horizon; the stadium hides most of it
            sky = mix(sky * 0.45, sky, smoothstep(-0.25, 0.0, h));

            gl_FragColor = vec4(sky, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    // built once; the effect below keeps it in step with the preset
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const u = material.uniforms;
    (u.uHorizon.value as Color).set(env.sky.horizon);
    (u.uMid.value as Color).set(env.sky.mid);
    (u.uZenith.value as Color).set(env.sky.zenith);
    (u.uGlow.value as Color).set(env.glow);
    u.uLightDir.value = env.lightDirection;
    u.uGlowStrength.value = env.mode === 'SUN' ? 1 : 0.35;
  }, [env, material]);

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-3}>
      <sphereGeometry args={[DOME_RADIUS, 32, 20]} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// sun / moon
// ---------------------------------------------------------------------------

/** The visible disc where the light comes from. */
function LightDisc({ env }: { env: EnvironmentPreset }) {
  const distance = DOME_RADIUS * 0.85;
  const position: [number, number, number] = [
    env.lightDirection[0] * distance,
    env.lightDirection[1] * distance,
    env.lightDirection[2] * distance,
  ];

  return (
    <group position={position}>
      <mesh>
        <circleGeometry args={[DOME_RADIUS * env.discSize, 32]} />
        <meshBasicMaterial color={env.discColor} side={DoubleSide} toneMapped={false} />
      </mesh>
      {/* a soft halo, tighter at night than around the sun */}
      <mesh>
        <circleGeometry args={[DOME_RADIUS * env.discSize * (env.moon ? 2.1 : 2.6), 32]} />
        <meshBasicMaterial
          color={env.glow}
          transparent
          opacity={env.moon ? 0.22 : 0.32}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      {/* the moon gets a few maria, so it is not a blank disc */}
      {env.moon && (
        <group position={[0, 0, 1]}>
          {[
            [-0.3, 0.25, 0.3],
            [0.28, -0.1, 0.22],
            [0.05, 0.4, 0.16],
          ].map(([x, y, r], i) => (
            <mesh key={i} position={[x * DOME_RADIUS * env.discSize, y * DOME_RADIUS * env.discSize, 0]}>
              <circleGeometry args={[DOME_RADIUS * env.discSize * r, 16]} />
              <meshBasicMaterial color="#c8d2e8" side={DoubleSide} toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// stars
// ---------------------------------------------------------------------------

/**
 * Night stars, as one Points.
 *
 * Scattered over the upper hemisphere only -- the lower half is behind the
 * stadium anyway -- and given per-star size and twinkle phase so the field
 * does not look like a regular grid of identical dots.
 */
function Stars({ count }: { count: number }) {
  const geometry = useMemo(() => {
    const rng = new Rng(0x57a2);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const r = DOME_RADIUS * 0.94;

    for (let i = 0; i < count; i++) {
      // bias toward the upper dome
      const u = rng.range(-0.12, 1);
      const theta = rng.float() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
      // a few bright ones among many faint
      sizes[i] = rng.float() < 0.06 ? rng.range(2.2, 3.6) : rng.range(0.6, 1.5);
      phases[i] = rng.float() * Math.PI * 2;
    }

    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.setAttribute('aSize', new BufferAttribute(sizes, 1));
    g.setAttribute('aPhase', new BufferAttribute(phases, 1));
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uScale: { value: DOME_RADIUS * 0.02 } },
        vertexShader: /* glsl */ `
          attribute float aSize;
          attribute float aPhase;
          uniform float uTime;
          uniform float uScale;
          varying float vTwinkle;
          void main() {
            vTwinkle = 0.65 + 0.35 * sin(uTime * 1.6 + aPhase);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uScale / max(1.0, -mv.z) * 40.0;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vTwinkle;
          void main() {
            vec2 d = gl_PointCoord - 0.5;
            float r = length(d);
            if (r > 0.5) discard;
            float a = pow(1.0 - r * 2.0, 1.8) * vTwinkle;
            gl_FragColor = vec4(vec3(0.88, 0.92, 1.0) * a, a);
          }
        `,
      }),
    [],
  );

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;
  });

  if (count <= 0) return null;
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-2} />;
}

// ---------------------------------------------------------------------------
// clouds
// ---------------------------------------------------------------------------

/**
 * Two belts of billboard clouds.
 *
 * Each instance is one quad shaded as a clump of soft lobes, so a cloud has
 * internal structure with no geometry behind it. They drift, and they take
 * their palette from the preset -- night clouds are darker but still there.
 */
function Clouds({ count, env }: { count: number; env: EnvironmentPreset }) {
  const ref = useRef<InstancedMesh>(null);

  const layout = useMemo(() => {
    const rng = new Rng(0xc10d);
    return Array.from({ length: count }, (_, i) => {
      const low = i % 3 !== 0;
      return {
        angle: rng.float() * Math.PI * 2,
        radius: low
          ? BOARD.outerRadius * (1.5 + rng.float() * 1.2)
          : BOARD.outerRadius * (2.2 + rng.float() * 2.4),
        y: low
          ? BOARD.outerRadius * (0.35 + rng.float() * 0.3)
          : BOARD.outerRadius * (0.9 + rng.float() * 1.1),
        scale: BOARD.outerRadius * (low ? 0.34 + rng.float() * 0.3 : 0.5 + rng.float() * 0.6),
        seed: rng.float(),
        drift: 0.006 + rng.float() * 0.012,
      };
    });
  }, [count]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uLight: { value: new Color(env.clouds.light) },
          uShade: { value: new Color(env.clouds.shade) },
          uOpacity: { value: env.clouds.opacity },
        },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          varying vec2 vUv;
          varying float vSeed;
          void main() {
            vUv = uv;
            vSeed = aSeed;
            // Billboard: the instance's centre into view space, then offset in
            // screen axes. Going through instanceMatrix is the part that
            // matters -- without it every cloud collapses onto the origin.
            vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            vec2 scale = vec2(
              length(instanceMatrix[0].xyz),
              length(instanceMatrix[1].xyz)
            );
            centre.xy += position.xy * scale;
            gl_Position = projectionMatrix * centre;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uLight;
          uniform vec3 uShade;
          uniform float uOpacity;
          varying vec2 vUv;
          varying float vSeed;

          float puff(vec2 p, vec2 c, float r) {
            return smoothstep(r, r * 0.25, length(p - c));
          }

          void main() {
            vec2 p = vUv - 0.5;
            float s = vSeed;
            float a = puff(p, vec2(0.0, -0.02), 0.30);
            a += puff(p, vec2(-0.20 - s * 0.05, -0.06), 0.20);
            a += puff(p, vec2(0.19 + s * 0.06, -0.05), 0.22);
            a += puff(p, vec2(-0.08, 0.10 + s * 0.04), 0.19);
            a += puff(p, vec2(0.10, 0.09 - s * 0.03), 0.17);
            a = clamp(a, 0.0, 1.0);
            if (a < 0.01) discard;

            vec3 col = mix(uShade, uLight, smoothstep(-0.2, 0.28, vUv.y));
            gl_FragColor = vec4(col, a * uOpacity);
            #include <colorspace_fragment>
          }
        `,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    (material.uniforms.uLight.value as Color).set(env.clouds.light);
    (material.uniforms.uShade.value as Color).set(env.clouds.shade);
    material.uniforms.uOpacity.value = env.clouds.opacity;
  }, [env, material]);

  const dummy = useMemo(() => new Object3D(), []);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    // Clouds move slowly enough that a quarter-rate update is invisible, and
    // it keeps a hundred matrix writes off most frames.
    if (Math.floor(clock.elapsedTime * 60) % 4 !== 0) return;

    layout.forEach((c, i) => {
      const angle = c.angle + clock.elapsedTime * c.drift;
      dummy.position.set(Math.cos(angle) * c.radius, c.y, -Math.sin(angle) * c.radius);
      dummy.scale.set(c.scale, c.scale * 0.6, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  const seeds = useMemo(
    () => new InstancedBufferAttribute(Float32Array.from(layout.map((c) => c.seed)), 1),
    [layout],
  );

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, material, layout.length]}
      frustumCulled={false}
      renderOrder={-1}
    >
      <planeGeometry args={[1, 1]}>
        <primitive object={seeds} attach="attributes-aSeed" />
      </planeGeometry>
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

export function Sky({
  env,
  quality,
}: {
  env: EnvironmentPreset;
  quality: 'LOW' | 'MEDIUM' | 'HIGH';
}) {
  const clouds = quality === 'LOW' ? 26 : quality === 'MEDIUM' ? 48 : 76;
  const stars =
    env.stars === 0
      ? 0
      : quality === 'LOW'
        ? Math.round(env.stars * 0.35)
        : quality === 'MEDIUM'
          ? Math.round(env.stars * 0.7)
          : env.stars;

  return (
    <group name="sky">
      <SkyDome env={env} />
      <Stars count={stars} />
      <LightDisc env={env} />
      <Clouds count={clouds} env={env} />
    </group>
  );
}
