/**
 * The fly's external anatomy.
 *
 * One persistent object for the whole session. Entering brain mode does not
 * swap this out for a different scene; it raises the `fade` uniform on every
 * body material so the cuticle turns to glass and the connectome inside
 * becomes visible. That is what makes "whole fly -> transparent head -> exposed
 * brain" feel like one continuous model rather than three.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Group, Mesh, MeshPhysicalMaterial, ShaderMaterial } from 'three';

import {
  createCompoundEyeMaterial,
  createCuticleMaterial,
  createHeadInteriorMaterial,
  createVeinMaterial,
  createWingMaterial,
  setCuticleFade,
} from './materials/flyMaterials';
import { flyGeometry } from './geometry/flyGeometry';
import { ABDOMEN, EYES, type FlyPartKey } from './flyAnatomy';
import { useStore } from '../store/useStore';

/**
 * Cuticle colours.
 *
 * Drosophila melanogaster is a yellow-brown fly with a darker, banded abdomen
 * and brick-red eyes. Keeping the body warm and desaturated also leaves the
 * cool end of the spectrum free for the neural data, so the two never compete.
 */
const PALETTE = {
  head: 0x8a6a3f,
  thorax: 0x7d5c35,
  abdomen: 0x4f3a21,
  legs: 0x6b4f2e,
  antennae: 0x8f7047,
  proboscis: 0x9a7b4e,
  halteres: 0xb09668,
};

interface BodyPartProps {
  partKey: FlyPartKey;
  children: React.ReactNode;
}

export function FlyBody() {
  const xray = useStore((s) => s.xray);
  const showAnatomy = useStore((s) => s.layers.anatomy);
  const selectedPart = useStore((s) => s.selectedPart);
  const selectPart = useStore((s) => s.selectPart);

  const geometry = useMemo(() => flyGeometry(), []);
  const groupRef = useRef<Group>(null);

  // Materials are created once and mutated, never recreated: rebuilding a
  // ShaderMaterial recompiles its program, which stalls the frame.
  const materials = useMemo(
    () => ({
      head: createCuticleMaterial({ color: PALETTE.head, roughness: 0.48, clearcoat: 0.5 }),
      thorax: createCuticleMaterial({ color: PALETTE.thorax, roughness: 0.42, clearcoat: 0.6 }),
      abdomen: createCuticleMaterial({
        color: PALETTE.abdomen,
        roughness: 0.62,
        clearcoat: 0.25,
        bands: ABDOMEN.segments,
      }),
      legs: createCuticleMaterial({ color: PALETTE.legs, roughness: 0.7, metalness: 0.05 }),
      antennae: createCuticleMaterial({ color: PALETTE.antennae, roughness: 0.65 }),
      proboscis: createCuticleMaterial({ color: PALETTE.proboscis, roughness: 0.6 }),
      halteres: createCuticleMaterial({ color: PALETTE.halteres, roughness: 0.55 }),
      eyeL: createCompoundEyeMaterial(EYES.ommatidiaCount),
      eyeR: createCompoundEyeMaterial(EYES.ommatidiaCount),
      wing: createWingMaterial(),
      veins: createVeinMaterial(),
      interior: createHeadInteriorMaterial(),
    }),
    [],
  );

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [materials]);

  // Push the X-ray amount into every material.
  useEffect(() => {
    const cuticles: MeshPhysicalMaterial[] = [
      materials.head,
      materials.thorax,
      materials.abdomen,
      materials.legs,
      materials.antennae,
      materials.proboscis,
      materials.halteres,
    ];
    // The head must lead the rest: the brain is inside it, so it clears first
    // and further, while the body only thins enough to stay readable.
    for (const m of cuticles) setCuticleFade(m, xray * 0.72);
    setCuticleFade(materials.head, Math.min(1, xray * 1.12));

    const shaders: ShaderMaterial[] = [
      materials.eyeL,
      materials.eyeR,
      materials.wing,
      materials.veins,
      materials.interior,
    ];
    for (const m of shaders) {
      const u = m.uniforms.uFade;
      if (u) u.value = xray;
    }
    materials.interior.uniforms.uFade.value = xray;
  }, [xray, materials]);

  // Selection highlight on the eyes, the only body part with its own shader
  // flag for it.
  useEffect(() => {
    materials.eyeL.uniforms.uSelected.value = selectedPart === 'eye-l' ? 1 : 0;
    materials.eyeR.uniforms.uSelected.value = selectedPart === 'eye-r' ? 1 : 0;
  }, [selectedPart, materials]);

  const Part = ({ partKey, children }: BodyPartProps) => {
    const onClick = (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      selectPart(partKey);
    };
    return (
      <group onClick={onClick} onPointerOver={(e) => e.stopPropagation()}>
        {children}
      </group>
    );
  };

  if (!showAnatomy) return null;

  return (
    <group ref={groupRef} name="fly-body">
      {/* head ------------------------------------------------------------ */}
      <Part partKey="head">
        <mesh geometry={geometry.head} material={materials.head} castShadow receiveShadow />
      </Part>
      {/* inner shell, so the brain reads as enclosed once the cuticle clears */}
      <mesh geometry={geometry.head} material={materials.interior} renderOrder={2} />

      <Part partKey="eye-l">
        <mesh geometry={geometry.eyeL} material={materials.eyeL} />
      </Part>
      <Part partKey="eye-r">
        <mesh geometry={geometry.eyeR} material={materials.eyeR} />
      </Part>

      <Part partKey="antenna-r">
        <mesh geometry={geometry.antennae} material={materials.antennae} />
      </Part>
      <Part partKey="proboscis">
        <mesh geometry={geometry.proboscis} material={materials.proboscis} />
      </Part>

      {/* thorax ---------------------------------------------------------- */}
      <Part partKey="thorax">
        <mesh geometry={geometry.thorax} material={materials.thorax} castShadow />
      </Part>
      <Part partKey="leg-mid-r">
        <mesh geometry={geometry.legs} material={materials.legs} />
      </Part>
      <mesh geometry={geometry.halteres} material={materials.halteres} />

      {/* wings ----------------------------------------------------------- */}
      <Part partKey="wing-l">
        <mesh geometry={geometry.wingL} material={materials.wing} renderOrder={3} />
      </Part>
      <Part partKey="wing-r">
        <mesh geometry={geometry.wingR} material={materials.wing} renderOrder={3} />
      </Part>
      <lineSegments geometry={geometry.veinsL} material={materials.veins} renderOrder={4} />
      <lineSegments geometry={geometry.veinsR} material={materials.veins} renderOrder={4} />

      {/* abdomen --------------------------------------------------------- */}
      <Part partKey="abdomen">
        <mesh geometry={geometry.abdomen} material={materials.abdomen} castShadow />
      </Part>
    </group>
  );
}

/** Reference to the mesh type, kept so callers can type refs if they need to. */
export type FlyMesh = Mesh;
