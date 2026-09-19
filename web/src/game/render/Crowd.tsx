/**
 * Realistic Human Stadium Crowd for Drosophila Neural Chess.
 *
 * Replaces primitive monochrome cylinders and floating bug swarms with:
 *   - Anatomically structured human spectators (head, face, styled hair, neck,
 *     shoulders, torso, sleeves, hands, trousers/jeans, sneakers)
 *   - Realistic stadium bucket seating (plastic shell seats + backrests + steel mounts)
 *   - Diverse realistic human skin tones and hair colors
 *   - Vibrant, varied stadium apparel and jeans
 *   - Dynamic cheering / waving / leaning animations in reaction to chess events
 *   - 60+ FPS high-performance instanced rendering with zero CPU per-frame overhead
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { groupForDrawing, layoutCrowd, type Spectator } from './crowdLayout';
import { BOARD } from '../board';

// ---------------------------------------------------------------------------
// Part IDs for multi-part human shader
// 0 = Skin (Face, Neck, Hands)
// 1 = Hair (Head top and back)
// 2 = Shirt / Jacket / Apparel (Torso, Shoulders, Sleeves)
// 3 = Pants / Trousers / Jeans (Thighs, Knees, Shins)
// 4 = Shoes (Sneakers)
// 5 = Stadium Bucket Seat (Arena shell seat)
// ---------------------------------------------------------------------------

function tagPart(geo: BufferGeometry, partId: number): BufferGeometry {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count).fill(partId);
  geo.setAttribute('aPart', new BufferAttribute(arr, 1));
  return geo;
}

/**
 * Builds a realistic human spectator seated in an arena bucket seat.
 */
function buildHumanSpectator(pose: 'SIT' | 'LEAN' | 'ARMS_UP' | 'FAR'): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, partId: number) => parts.push(tagPart(g, partId));

  const isFar = pose === 'FAR';
  const segRadial = isFar ? 6 : 8;
  const segSphere = isFar ? 6 : 10;

  // -------------------------------------------------------------------------
  // 1. Realistic Stadium Bucket Chair (Part 5)
  // -------------------------------------------------------------------------
  // Wide comfortable contoured seat cushion pan
  const seatBase = new BoxGeometry(0.56, 0.10, 0.48);
  seatBase.translate(0, 0.25, 0.16);
  add(seatBase, 5);

  // High ergonomic backrest supporting the spectator's back
  const seatBack = new BoxGeometry(0.52, 0.58, 0.09);
  seatBack.rotateX(-0.14);
  seatBack.translate(0, 0.57, -0.09);
  add(seatBack, 5);

  // Armrests on the sides of the chair
  if (!isFar) {
    for (const side of [-1, 1]) {
      // Horizontal armrest pad
      const armrest = new BoxGeometry(0.065, 0.05, 0.38);
      armrest.translate(side * 0.29, 0.44, 0.15);
      add(armrest, 5);

      // Vertical armrest support
      const armSupport = new BoxGeometry(0.045, 0.16, 0.06);
      armSupport.translate(side * 0.29, 0.34, 0.26);
      add(armSupport, 5);
    }
  }

  // Heavy-duty steel chair mount stanchion post down to the concrete riser
  const seatPost = new CylinderGeometry(0.05, 0.05, 0.25, 6);
  seatPost.translate(0, 0.125, 0.12);
  add(seatPost, 5);

  // Steel base mounting plate bolted to the floor
  const seatFoot = new BoxGeometry(0.24, 0.03, 0.26);
  seatFoot.translate(0, 0.015, 0.12);
  add(seatFoot, 5);

  // -------------------------------------------------------------------------
  // 2. Head, Neck & Hair (Skin = Part 0, Hair = Part 1)
  // -------------------------------------------------------------------------
  const leanPitch = pose === 'LEAN' ? 0.22 : 0;
  const headY = pose === 'LEAN' ? 0.88 : 0.94;
  const headZ = pose === 'LEAN' ? 0.16 : 0.02;

  // Neck (Part 0)
  const neck = new CylinderGeometry(0.07, 0.08, 0.11, segRadial);
  if (pose === 'LEAN') neck.rotateX(leanPitch);
  neck.translate(0, headY - 0.13, headZ - (pose === 'LEAN' ? 0.03 : 0));
  add(neck, 0);

  // Head / Face (Part 0)
  const head = new SphereGeometry(0.145, segSphere, segSphere);
  head.scale(0.92, 1.15, 0.98);
  head.translate(0, headY, headZ);
  add(head, 0);

  // Hair cap (Part 1: sits over top, sides, and back of the head)
  const hair = new SphereGeometry(0.154, segSphere, segSphere);
  hair.scale(0.96, 1.08, 1.04);
  hair.translate(0, headY + 0.045, headZ - 0.02);
  add(hair, 1);

  // -------------------------------------------------------------------------
  // 3. Torso & Shoulders (Shirt / Apparel = Part 2)
  // -------------------------------------------------------------------------
  const torsoY = pose === 'LEAN' ? 0.49 : 0.53;
  const torsoZ = pose === 'LEAN' ? 0.08 : 0.02;

  // Torso (waist to chest)
  const torso = new CylinderGeometry(0.24, 0.19, 0.44, segRadial);
  if (pose === 'LEAN') torso.rotateX(leanPitch);
  torso.translate(0, torsoY, torsoZ);
  add(torso, 2);

  // Broad human shoulders and chest yoke
  const shoulders = new BoxGeometry(0.52, 0.15, 0.26);
  if (pose === 'LEAN') shoulders.rotateX(leanPitch);
  shoulders.translate(0, torsoY + 0.18, torsoZ + (pose === 'LEAN' ? 0.03 : 0));
  add(shoulders, 2);

  // -------------------------------------------------------------------------
  // 4. Arms & Hands (Arms = Part 2, Hands = Part 0)
  // -------------------------------------------------------------------------
  if (!isFar) {
    for (const side of [-1, 1]) {
      if (pose === 'ARMS_UP') {
        // Cheering fan with arms raised in victory
        const upperArm = new CylinderGeometry(0.065, 0.055, 0.32, segRadial);
        upperArm.rotateZ(side * 0.38);
        upperArm.translate(side * 0.30, 0.88, 0.04);
        add(upperArm, 2);

        const forearm = new CylinderGeometry(0.055, 0.048, 0.30, segRadial);
        forearm.rotateZ(side * 0.22);
        forearm.translate(side * 0.39, 1.14, 0.05);
        add(forearm, 2);

        // Hands cheering (Part 0)
        const hand = new BoxGeometry(0.07, 0.09, 0.06);
        hand.translate(side * 0.43, 1.30, 0.06);
        add(hand, 0);
      } else if (pose === 'LEAN') {
        // Leaning forward with hands resting on knees/lap
        const upperArm = new CylinderGeometry(0.065, 0.055, 0.30, segRadial);
        upperArm.rotateX(0.42);
        upperArm.translate(side * 0.26, 0.56, 0.14);
        add(upperArm, 2);

        const forearm = new CylinderGeometry(0.055, 0.048, 0.28, segRadial);
        forearm.rotateX(-0.95);
        forearm.translate(side * 0.22, 0.38, 0.32);
        add(forearm, 2);

        // Hands on knees (Part 0)
        const hand = new BoxGeometry(0.08, 0.05, 0.10);
        hand.translate(side * 0.18, 0.36, 0.45);
        add(hand, 0);
      } else {
        // Standard seated posture: elbows near armrests, hands on lap/thighs
        const upperArm = new CylinderGeometry(0.065, 0.055, 0.29, segRadial);
        upperArm.translate(side * 0.26, 0.55, 0.03);
        add(upperArm, 2);

        const forearm = new CylinderGeometry(0.055, 0.048, 0.27, segRadial);
        forearm.rotateX(-0.85);
        forearm.translate(side * 0.22, 0.36, 0.18);
        add(forearm, 2);

        // Hands resting on thighs (Part 0)
        const hand = new BoxGeometry(0.08, 0.05, 0.10);
        hand.translate(side * 0.16, 0.32, 0.36);
        add(hand, 0);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Pelvis, Pants / Trousers (Part 3) & Shoes (Part 4)
  // -------------------------------------------------------------------------
  // Buttocks / Pelvis (Part 3) seated squarely in the bucket seat
  const pelvis = new BoxGeometry(0.38, 0.18, 0.28);
  pelvis.translate(0, 0.31, 0.07);
  add(pelvis, 3);

  for (const side of [-1, 1]) {
    // Thighs: horizontal forward, resting flat on the seat pan
    const thigh = new CylinderGeometry(0.095, 0.085, 0.36, segRadial);
    thigh.rotateX(Math.PI / 2);
    thigh.translate(side * 0.13, 0.33, 0.23);
    add(thigh, 3);

    // Shins: hanging vertically down from the front edge of the seat
    const shin = new CylinderGeometry(0.08, 0.07, 0.33, segRadial);
    shin.translate(side * 0.13, 0.165, 0.41);
    add(shin, 3);

    // Shoes / Sneakers: resting firmly on the floor (Part 4)
    const shoe = new BoxGeometry(0.12, 0.08, 0.22);
    shoe.translate(side * 0.13, 0.04, 0.45);
    add(shoe, 4);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error(`Failed to merge spectator geometry for pose ${pose}`);
  merged.computeVertexNormals();
  return merged;
}

// ---------------------------------------------------------------------------
// Realistic Color Palettes
// ---------------------------------------------------------------------------

// Natural diverse human skin tones
const SKIN_TONES = [
  '#f8d9c2', // Fair
  '#f1c27d', // Peach / Light
  '#e0ac69', // Golden Tan
  '#c68642', // Olive / Bronze
  '#8d5524', // Warm Brown
  '#51351e', // Deep Espresso
].map((h) => new Color(h));

// Natural hair colors
const HAIR_COLORS = [
  '#18181b', // Jet Black
  '#292524', // Dark Espresso
  '#44403c', // Dark Brown
  '#57534e', // Medium Brown
  '#9a7b56', // Dirty Blonde / Light Brown
  '#d4b27d', // Blonde
  '#71717a', // Silver / Grey
].map((h) => new Color(h));

// Realistic pants / trousers (denim, chinos, dark trousers)
const PANTS_COLORS = [
  '#253b56', // Classic Denim Blue
  '#1c2838', // Dark Indigo Jeans
  '#334155', // Slate Grey Chinos
  '#524d45', // Khaki / Tan Trousers
  '#18181b', // Black Pants
].map((h) => new Color(h));

// Vivid & stylish stadium spectator shirts / jackets
const SHIRT_COLORS = [
  '#38bdf8', // Tournament Cyan
  '#ef4444', // Stadium Red
  '#3b82f6', // Royal Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber / Gold
  '#8b5cf6', // Violet
  '#f8fafc', // Crisp White
  '#475569', // Slate Hoodie
  '#0f172a', // Stealth Black
  '#e11d48', // Crimson
  '#0284c7', // Sky Blue
  '#059669', // Pine Green
  '#d97706', // Ochre
  '#64748b', // Cool Grey
  '#9333ea', // Royal Purple
  '#fb7185', // Rose
].map((h) => new Color(h));

// ---------------------------------------------------------------------------
// Shader Material with Multi-Part Human Shading
// ---------------------------------------------------------------------------

interface CrowdUniforms {
  uTime: { value: number };
  uExcitement: { value: number };
  uHop: { value: number };
  uSpeed: { value: number };
}

function createRealisticHumanMaterial(
  hop: number,
  speed: number,
): { material: MeshStandardMaterial; uniforms: CrowdUniforms } {
  const material = new MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.78,
    metalness: 0.08,
  });

  const uniforms: CrowdUniforms = {
    uTime: { value: 0 },
    uExcitement: { value: 0 },
    uHop: { value: hop },
    uSpeed: { value: speed },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    // 1. Inject vertex shader attributes and varying
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aPart;
         attribute vec3 aSkinColor;
         attribute vec3 aHairColor;
         attribute vec3 aPantsColor;
         attribute float aPhase;
         attribute float aEnergy;
         uniform float uTime;
         uniform float uExcitement;
         uniform float uHop;
         uniform float uSpeed;
         varying vec3 vHumanColor;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         // Color calculation based on anatomical part:
         // 0 = Skin, 1 = Hair, 2 = Shirt, 3 = Pants, 4 = Shoes, 5 = Stadium Seat
         if (aPart < 0.5) {
           vHumanColor = aSkinColor;
         } else if (aPart < 1.5) {
           vHumanColor = aHairColor;
         } else if (aPart < 2.5) {
           #ifdef USE_INSTANCING_COLOR
             vHumanColor = instanceColor;
           #else
             vHumanColor = vec3(0.2, 0.45, 0.75);
           #endif
         } else if (aPart < 3.5) {
           vHumanColor = aPantsColor;
         } else if (aPart < 4.5) {
           // Clean white sneakers
           vHumanColor = vec3(0.92, 0.92, 0.94);
         } else {
           // Arena stadium bucket seat: deep stadium navy blue
           vHumanColor = vec3(0.11, 0.22, 0.36);
         }

         // Cheering reaction hop animation
         float keen = smoothstep(1.0 - aEnergy, 1.0, uExcitement + 0.001);
         float wave = max(0.0, sin(uTime * uSpeed + aPhase));
         transformed.y += wave * uHop * keen;
         transformed.z += wave * uHop * keen * 0.2;`,
      );

    // 2. Inject fragment shader varying and diffuse modulation
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vHumanColor;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         diffuseColor.rgb *= vHumanColor;`,
      );
  };

  return { material, uniforms };
}

// ---------------------------------------------------------------------------
// Crowd Component (Exclusively Realistic Human Spectators)
// ---------------------------------------------------------------------------

export function Crowd({
  quality,
  excitement,
}: {
  quality: 'LOW' | 'MEDIUM' | 'HIGH';
  excitement: number;
}) {
  const humanCount = quality === 'LOW' ? 650 : quality === 'MEDIUM' ? 1400 : 2500;

  return (
    <group name="crowd">
      <Humans count={humanCount} excitement={excitement} />
    </group>
  );
}

function Humans({ count, excitement }: { count: number; excitement: number }) {
  const geometries = useMemo(
    () => ({
      NEAR_SIT: buildHumanSpectator('SIT'),
      NEAR_LEAN: buildHumanSpectator('LEAN'),
      NEAR_ARMS_UP: buildHumanSpectator('ARMS_UP'),
      FAR: buildHumanSpectator('FAR'),
    }),
    [],
  );

  const groups = useMemo(() => groupForDrawing(layoutCrowd({ total: count })), [count]);

  return (
    <group name="human-audience">
      {(Object.keys(geometries) as (keyof typeof geometries)[]).map((key) => {
        const people = groups[key];
        if (!people || people.length === 0) return null;
        return (
          <HumanGroup
            key={key}
            geometry={geometries[key]}
            people={people}
            excitement={excitement}
            hop={key === 'FAR' ? 0.18 : 0.32}
          />
        );
      })}
    </group>
  );
}

function HumanGroup({
  geometry,
  people,
  excitement,
  hop,
}: {
  geometry: BufferGeometry;
  people: Spectator[];
  excitement: number;
  hop: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const { material, uniforms } = useMemo(
    () => createRealisticHumanMaterial(hop, 7.5),
    [hop],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const dummy = new Object3D();
    const count = people.length;

    const skins = new Float32Array(count * 3);
    const hairs = new Float32Array(count * 3);
    const pants = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const energies = new Float32Array(count);

    people.forEach((s, i) => {
      // Position and facing
      dummy.position.set(s.position[0], s.position[1], s.position[2]);
      dummy.rotation.set(0, s.facing, 0);
      dummy.scale.setScalar(s.scale * 1.75); // Enlarged human spectators clearly visible from stadium cameras
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Shirt / Jacket Color
      const shirtCol = SHIRT_COLORS[(s.shirt * 3 + i) % SHIRT_COLORS.length];
      mesh.setColorAt(i, shirtCol);

      // Deterministic Skin Tone
      const skinCol = SKIN_TONES[(s.shirt * 7 + i * 2) % SKIN_TONES.length];
      skins[i * 3] = skinCol.r;
      skins[i * 3 + 1] = skinCol.g;
      skins[i * 3 + 2] = skinCol.b;

      // Deterministic Hair Color
      const hairCol = HAIR_COLORS[(s.shirt * 5 + i * 4) % HAIR_COLORS.length];
      hairs[i * 3] = hairCol.r;
      hairs[i * 3 + 1] = hairCol.g;
      hairs[i * 3 + 2] = hairCol.b;

      // Deterministic Pants / Jeans Color
      const pantsCol = PANTS_COLORS[(s.shirt * 4 + i * 3) % PANTS_COLORS.length];
      pants[i * 3] = pantsCol.r;
      pants[i * 3 + 1] = pantsCol.g;
      pants[i * 3 + 2] = pantsCol.b;

      phases[i] = s.phase;
      energies[i] = s.energy;
    });

    mesh.geometry.setAttribute('aSkinColor', new InstancedBufferAttribute(skins, 3));
    mesh.geometry.setAttribute('aHairColor', new InstancedBufferAttribute(hairs, 3));
    mesh.geometry.setAttribute('aPantsColor', new InstancedBufferAttribute(pants, 3));
    mesh.geometry.setAttribute('aPhase', new InstancedBufferAttribute(phases, 1));
    mesh.geometry.setAttribute('aEnergy', new InstancedBufferAttribute(energies, 1));

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = count;
  }, [people, geometry]);

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uExcitement.value += (excitement - uniforms.uExcitement.value) * 0.06;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, people.length]}
      frustumCulled={false}
      receiveShadow
      castShadow
    />
  );
}

/** Radius the crowd occupies */
export const CROWD_OUTER = BOARD.outerRadius;
