/**
 * The 3D scene: one fly, with the connectome inside its head.
 *
 * Lighting is a three-point rig tuned for a dark instrument. Chitin needs a
 * strong key to show its sheen, while the emissive neuron layer needs the
 * ambient kept low or it washes out the moment the head turns transparent.
 */

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, Grid, OrbitControls, Stats } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ACESFilmicToneMapping, Points, Raycaster, Vector2 } from 'three';

import {
  ActiveConnectionLayer,
  BrainGroup,
  CompartmentLayer,
  ConnectionLayer,
  LocalNetworkLayer,
  NeuronLayer,
  PathwayLayer,
  PulseLayer,
} from './BrainLayers';
import { CameraRig } from './CameraRig';
import { FlyBody } from './FlyBody';
import { useStore } from '../store/useStore';

/**
 * Hover picking for the neuron cloud.
 *
 * react-three-fiber raycasts on every pointer move for any object with a
 * pointer handler, and a linear scan of 138,639 points at pointer-move rate
 * would drop frames. This throttles to ~15 Hz and raycasts manually, which
 * keeps hover responsive without touching the render loop.
 */
function NeuronHover() {
  const { camera, scene, gl } = useThree();
  const setHovered = useStore((s) => s.setHovered);
  const neuronsVisible = useStore((s) => s.layers.neurons);

  const raycaster = useMemo(() => {
    const r = new Raycaster();
    // brain-space units; the group scale is applied by the raycast itself
    r.params.Points = { threshold: 0.055 };
    return r;
  }, []);

  useEffect(() => {
    if (!neuronsVisible) {
      setHovered(null);
      return;
    }

    const pointer = new Vector2();
    let last = 0;
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      const now = performance.now();
      if (now - last < 66) return;
      last = now;

      const rect = gl.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const points = scene.getObjectByName('neurons');
        if (!(points instanceof Points)) return;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(points, false);
        setHovered(hits.length > 0 && hits[0].index !== undefined ? hits[0].index : null);
      });
    };

    const canvas = gl.domElement;
    canvas.addEventListener('pointermove', onMove);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
      setHovered(null);
    };
  }, [camera, scene, gl, raycaster, setHovered, neuronsVisible]);

  return null;
}

/** Slow idle orbit, so the model reads as three-dimensional before any input. */
function IdleDrift({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const reducedMotion = useStore((s) => s.reducedMotion);
  const simState = useStore((s) => s.simState);
  const idle = useRef(0);

  useFrame((_, delta) => {
    if (reducedMotion || simState === 'RUNNING') return;
    const c = controls.current;
    if (!c) return;
    idle.current += delta;
    // only drifts once the user has left it alone for a while
    if (idle.current > 6) c.autoRotate = true;
  });

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => {
      idle.current = 0;
      c.autoRotate = false;
    };
    const el = c.domElement;
    el?.addEventListener('pointerdown', stop);
    el?.addEventListener('wheel', stop);
    return () => {
      el?.removeEventListener('pointerdown', stop);
      el?.removeEventListener('wheel', stop);
    };
  }, [controls]);

  return null;
}

function Lighting() {
  return (
    <>
      {/* kept low so emissive neurons stay the brightest thing on screen */}
      <ambientLight intensity={0.28} color="#7d93b8" />
      <hemisphereLight args={['#93b4dd', '#2a1d12', 0.5]} />
      <directionalLight position={[18, 26, 20]} intensity={2.1} color="#fff4e2" castShadow />
      <directionalLight position={[-22, 6, -14]} intensity={0.85} color="#79b4ff" />
      {/* rim from behind, which is what separates the fly from the void */}
      <directionalLight position={[0, -10, -26]} intensity={0.7} color="#b58bff" />
    </>
  );
}

function SceneContents() {
  const controls = useRef<OrbitControlsImpl>(null);
  const showAxes = useStore((s) => s.layers.axes);
  const debug = useStore((s) => s.debug);

  return (
    <>
      <color attach="background" args={['#04060a']} />
      <fog attach="fog" args={['#04060a', 55, 135]} />
      <Lighting />

      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.65}
        zoomSpeed={0.9}
        panSpeed={0.7}
        minDistance={3}
        maxDistance={130}
        autoRotateSpeed={0.35}
        target={[0, -0.5, 0]}
      />
      <CameraRig controls={controls} />
      <IdleDrift controls={controls} />
      <NeuronHover />

      <FlyBody />

      <BrainGroup>
        <CompartmentLayer />
        <ConnectionLayer />
        <ActiveConnectionLayer />
        <NeuronLayer />
        <PulseLayer />
        <LocalNetworkLayer />
        <PathwayLayer />
      </BrainGroup>

      {showAxes && (
        <>
          <axesHelper args={[22]} />
          <Grid
            args={[120, 120]}
            position={[0, -12, 0]}
            cellSize={4}
            cellColor="#1d2d40"
            sectionSize={20}
            sectionColor="#2b4258"
            fadeDistance={130}
            infiniteGrid
          />
        </>
      )}

      <AdaptiveDpr pixelated />
      {debug && <Stats />}
    </>
  );
}

export function Scene() {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      camera={{ position: [26, 14, 30], fov: 42, near: 0.08, far: 400 }}
    >
      <Suspense fallback={null}>
        <SceneContents />
      </Suspense>
    </Canvas>
  );
}
