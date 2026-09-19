/**
 * Google FlyWire Style 3D Connectome Visualizer for Drosophila.
 *
 * Renders the adult fruit fly whole-brain connectome (138,639 neurons and synaptic
 * connectivity) with real-time neural firing cascades driven by fly AI cognition.
 */

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  SphereGeometry,
} from 'three';

import {
  createCompartmentMaterial,
  createConnectionMaterial,
  createNeuronMaterial,
} from '../../three/materials/brainMaterials';
import {
  createCompoundEyeMaterial,
  createCuticleMaterial,
} from '../../three/materials/flyMaterials';
import { flyGeometry } from '../../three/geometry/flyGeometry';
import { useStore } from '../../store/useStore';
import { liveBrain } from '../neural/liveBrainStream';

const COMPARTMENT_COLORS: Record<string, string> = {
  optic: '#38bdf8',
  central: '#818cf8',
  mushroom: '#c084fc',
  sensory: '#2dd4bf',
  sez: '#fbbf24',
};

// ---------------------------------------------------------------------------
// 3D Neuron Point Cloud Layer
// ---------------------------------------------------------------------------
function LiveNeuronCloud() {
  const connectome = useStore((s) => s.connectome);
  const pointsRef = useRef<Points>(null);
  const { gl } = useThree();

  const material = useMemo(() => {
    const mat = createNeuronMaterial();
    mat.uniforms.uHasActivity.value = 1.0;
    mat.uniforms.uBaseSize.value = 3.2;
    mat.uniforms.uActive.value = new Color('#38ef7d');   // Vibrant neon teal/green
    mat.uniforms.uSpike.value = new Color('#fff6a6');    // Hot white/gold spike
    mat.uniforms.uInactive.value = new Color('#2d4b68'); // Muted cosmic cyan
    return mat;
  }, []);

  const geometry = useMemo(() => {
    if (!connectome) return null;
    const n = connectome.neuronCount;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(connectome.positions, 3));

    const activationAttr = new Float32Array(n);
    g.setAttribute('aActivation', new BufferAttribute(activationAttr, 1));

    const degree = new Float32Array(n);
    const moduleId = new Float32Array(n);
    const index = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      degree[i] = connectome.degrees[i * 2 + 1];
      moduleId[i] = connectome.moduleIds[i];
      index[i] = i;
    }
    g.setAttribute('aDegree', new BufferAttribute(degree, 1));
    g.setAttribute('aModule', new BufferAttribute(moduleId, 1));
    g.setAttribute('aIndex', new BufferAttribute(index, 1));
    g.computeBoundingSphere();
    return g;
  }, [connectome]);

  useEffect(() => {
    material.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2);
  }, [gl, material]);

  useEffect(() => () => {
    geometry?.dispose();
    material.dispose();
  }, [geometry, material]);

  // Frame tick: feed real-time cognitive spike waves directly into the GPU buffer
  useFrame((_, delta) => {
    if (!geometry) return;
    const now = performance.now();

    liveBrain.update(delta, now, connectome);

    const attr = geometry.getAttribute('aActivation') as BufferAttribute;
    (attr.array as Float32Array).set(liveBrain.activation);
    attr.needsUpdate = true;

    material.uniforms.uTime.value = now * 0.001;
  });

  if (!connectome || !geometry) return null;

  return (
    <points
      ref={pointsRef}
      name="live-neurons"
      geometry={geometry}
      material={material}
      frustumCulled={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Synaptic Connectivity Lines
// ---------------------------------------------------------------------------
function LiveSynapses({ visible }: { visible: boolean }) {
  const connectome = useStore((s) => s.connectome);
  const material = useMemo(() => {
    const m = createConnectionMaterial();
    m.uniforms.uOpacity.value = 0.22;
    m.uniforms.uExcitatory.value = new Color('#00e5ff');
    m.uniforms.uInhibitory.value = new Color('#b388ff');
    return m;
  }, []);

  const geometry = useMemo(() => {
    if (!connectome || !visible) return null;
    const { pairs, weights, count } = connectome.edges;
    // Show top 18,000 synaptic paths for crisp, high-framerate visual wiring
    const drawCount = Math.min(count, 18000);
    const positions = new Float32Array(drawCount * 6);
    const weightAttr = new Float32Array(drawCount * 2);
    const signAttr = new Float32Array(drawCount * 2);
    const highlightAttr = new Float32Array(drawCount * 2);

    for (let e = 0; e < drawCount; e++) {
      const a = pairs[e * 2];
      const b = pairs[e * 2 + 1];
      positions[e * 6 + 0] = connectome.positions[a * 3];
      positions[e * 6 + 1] = connectome.positions[a * 3 + 1];
      positions[e * 6 + 2] = connectome.positions[a * 3 + 2];
      positions[e * 6 + 3] = connectome.positions[b * 3];
      positions[e * 6 + 4] = connectome.positions[b * 3 + 1];
      positions[e * 6 + 5] = connectome.positions[b * 3 + 2];

      const sign = weights[e] >= 0 ? 1 : -1;
      signAttr[e * 2] = sign;
      signAttr[e * 2 + 1] = sign;
      weightAttr[e * 2] = 0.7;
      weightAttr[e * 2 + 1] = 0.7;
      highlightAttr[e * 2] = 0;
      highlightAttr[e * 2 + 1] = 0;
    }

    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.setAttribute('aWeight', new BufferAttribute(weightAttr, 1));
    g.setAttribute('aSign', new BufferAttribute(signAttr, 1));
    g.setAttribute('aHighlight', new BufferAttribute(highlightAttr, 1));
    g.computeBoundingSphere();
    return g;
  }, [connectome, visible]);

  useEffect(() => () => {
    geometry?.dispose();
    material.dispose();
  }, [geometry, material]);

  if (!visible || !geometry) return null;

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}

// ---------------------------------------------------------------------------
// Neuropil Anatomical Scaffold Shells
// ---------------------------------------------------------------------------
function LiveNeuropils({ visible }: { visible: boolean }) {
  const connectome = useStore((s) => s.connectome);
  const unitSphere = useMemo(() => new SphereGeometry(1, 24, 18), []);
  const materials = useMemo(() => {
    const map = new Map<string, ReturnType<typeof createCompartmentMaterial>>();
    for (const [group, color] of Object.entries(COMPARTMENT_COLORS)) {
      const mat = createCompartmentMaterial(color);
      mat.uniforms.uOpacity.value = 0.14;
      map.set(group, mat);
    }
    return map;
  }, []);

  useEffect(() => () => {
    unitSphere.dispose();
    materials.forEach((m) => m.dispose());
  }, [unitSphere, materials]);

  if (!visible || !connectome?.anatomy) return null;

  return (
    <group name="neuropil-compartments">
      {connectome.anatomy.compartments.map((c) => (
        <mesh
          key={c.key}
          geometry={unitSphere}
          material={materials.get(c.group)}
          position={c.center}
          scale={c.radii}
          renderOrder={1}
        />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Translucent Fly Head Cuticle (Google Earth / FlyWire Style Silhouette)
// ---------------------------------------------------------------------------
function LiveHeadCuticle({ visible }: { visible: boolean }) {
  const geom = useMemo(() => flyGeometry(), []);

  const eyeMat = useMemo(() => {
    const m = createCompoundEyeMaterial(750);
    m.transparent = true;
    m.uniforms.uFade.value = 0.82;
    return m;
  }, []);

  const headMat = useMemo(() => {
    const m = createCuticleMaterial({ color: 0x8a6a3f, roughness: 0.35, clearcoat: 0.8 });
    m.transparent = true;
    m.opacity = 0.12;
    m.depthWrite = false;
    return m;
  }, []);

  useEffect(() => () => {
    eyeMat.dispose();
    headMat.dispose();
  }, [eyeMat, headMat]);

  if (!visible) return null;

  // Scale and translate head around the brain
  return (
    <group position={[0, -0.15, -1.8]} scale={1.12}>
      <mesh geometry={geom.head} material={headMat} />
      <mesh geometry={geom.eyeL} material={eyeMat} />
      <mesh geometry={geom.eyeR} material={eyeMat} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Scene Lighting & Camera Management
// ---------------------------------------------------------------------------
function BrainScene({
  autoRotate,
  showSynapses,
  showNeuropils,
  showCuticle,
  controlsRef,
}: {
  autoRotate: boolean;
  showSynapses: boolean;
  showNeuropils: boolean;
  showCuticle: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  return (
    <>
      <color attach="background" args={['#03060d']} />
      <fog attach="fog" args={['#03060d', 20, 50]} />

      <ambientLight intensity={0.4} color="#6ba6e0" />
      <directionalLight position={[10, 15, 12]} intensity={1.8} color="#ffffff" />
      <directionalLight position={[-12, -8, -10]} intensity={0.9} color="#7c3aed" />
      <directionalLight position={[0, 10, -15]} intensity={1.1} color="#06b6d4" />

      <OrbitControls
        ref={controlsRef as unknown as React.Ref<OrbitControlsImpl>}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        zoomSpeed={0.85}
        panSpeed={0.6}
        minDistance={3}
        maxDistance={40}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        target={[0, 0, 0]}
      />

      <group scale={1.18} position={[0, -0.2, 0]}>
        <LiveNeuropils visible={showNeuropils} />
        <LiveSynapses visible={showSynapses} />
        <LiveNeuronCloud />
        <LiveHeadCuticle visible={showCuticle} />
      </group>
    </>
  );
}

// ---------------------------------------------------------------------------
// Exported BrainCanvas Component
// ---------------------------------------------------------------------------
export interface BrainCanvasProps {
  autoRotate?: boolean;
  showSynapses?: boolean;
  showNeuropils?: boolean;
  showCuticle?: boolean;
  onResetCamera?: () => void;
}

export function BrainCanvas({
  autoRotate = true,
  showSynapses = true,
  showNeuropils = true,
  showCuticle = true,
}: BrainCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const connectome = useStore((s) => s.connectome);
  const loadSteps = useStore((s) => s.loadSteps);
  const loadError = useStore((s) => s.loadError);

  // Auto-bootstrap connectome data if not yet loaded
  useEffect(() => {
    if (!connectome) {
      void useStore.getState().bootstrap();
    }
  }, [connectome]);

  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center text-xs text-rose-400 bg-black/60">
        <div>
          <div className="font-bold mb-1">Failed to load connectome data</div>
          <div className="font-mono text-[10px] text-slate-400">{loadError}</div>
        </div>
      </div>
    );
  }

  if (!connectome) {
    const activeStep = loadSteps.find((s) => s.state === 'active') ?? loadSteps[0];
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#03060d] text-center p-6">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 animate-ping rounded-full bg-cyan-500/20" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
        <div className="font-mono text-xs uppercase tracking-widest text-cyan-400">
          Mounting FlyWire Connectome
        </div>
        <div className="text-[11px] text-slate-400">
          {activeStep?.label ?? 'Loading 138,639 neurons & 15M synapses...'}
        </div>
      </div>
    );
  }

  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      camera={{ position: [0, 1.4, 15.5], fov: 42, near: 0.1, far: 100 }}
    >
      <Suspense fallback={null}>
        <BrainScene
          autoRotate={autoRotate}
          showSynapses={showSynapses}
          showNeuropils={showNeuropils}
          showCuticle={showCuticle}
          controlsRef={controlsRef}
        />
      </Suspense>
    </Canvas>
  );
}
