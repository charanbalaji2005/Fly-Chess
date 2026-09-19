/**
 * Materials for the connectome layers living inside the head.
 *
 * These carry measured and simulated data, so their encodings are documented
 * rather than decorative:
 *
 *   neuron size       measured out-degree (hub neurons are larger)
 *   neuron brightness simulated activation, decaying after each spike
 *   neuron ring       SPIKING state, a shape cue so activity is not colour-only
 *   edge colour       measured sign: excitatory vs inhibitory
 *   edge opacity      measured synapse count
 */

import { AdditiveBlending, Color, ShaderMaterial, Uniform } from 'three';

/** Neuron display states, mirrored in the legend. */
export const NEURON_STATE = {
  inactive: 0,
  active: 1,
  spiking: 2,
} as const;

/**
 * Neuron point cloud.
 *
 * One THREE.Points draw call for all 138,639 neurons. Size is derived from
 * out-degree so the wiring hierarchy is visible even with no simulation
 * loaded, and activation drives emission on top of that.
 */
export function createNeuronMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uPixelRatio: new Uniform(1),
      uScale: new Uniform(1),
      uBaseSize: new Uniform(2.6),
      uOpacity: new Uniform(0.85),
      uSelected: new Uniform(-1),
      uHovered: new Uniform(-1),
      uHighlightModule: new Uniform(-1),
      /** 0 = show every neuron, 1 = show only neurons with activation. */
      uActiveOnly: new Uniform(0),
      /** 0 = no simulation loaded; suppresses the activity encodings. */
      uHasActivity: new Uniform(0),
      uInactive: new Uniform(new Color('#4b6b8a')),
      uActive: new Uniform(new Color('#5fe3c0')),
      uSpike: new Uniform(new Color('#fff1c9')),
      uSelectColor: new Uniform(new Color('#ffd166')),
      uTime: new Uniform(0),
    },
    vertexShader: /* glsl */ `
      attribute float aActivation;
      attribute float aDegree;
      attribute float aModule;
      attribute float aIndex;

      uniform float uPixelRatio;
      uniform float uScale;
      uniform float uBaseSize;
      uniform float uSelected;
      uniform float uHovered;
      uniform float uHighlightModule;
      uniform float uActiveOnly;
      uniform float uHasActivity;

      varying float vActivation;
      varying float vPicked;
      varying float vDim;

      void main() {
        vActivation = aActivation;

        float isSelected = step(0.5, 1.0 - abs(aIndex - uSelected));
        float isHovered = step(0.5, 1.0 - abs(aIndex - uHovered));
        vPicked = max(isSelected, isHovered * 0.6);

        // when a module is isolated, everything else recedes instead of
        // disappearing, so the neuron keeps its spatial context
        float moduleOn = step(0.0, uHighlightModule);
        float inModule = step(0.5, 1.0 - abs(aModule - uHighlightModule));
        vDim = moduleOn * (1.0 - inModule);

        vec4 mv = modelViewMatrix * vec4(position, 1.0);

        // measured out-degree sets the base radius; log-compressed because
        // degree spans four orders of magnitude
        float degreeSize = 0.55 + log(1.0 + aDegree) * 0.30;
        float activitySize = 1.0 + aActivation * 1.9 * uHasActivity;
        float size = uBaseSize * degreeSize * activitySize * uScale;
        size *= mix(1.0, 2.4, vPicked);
        size *= mix(1.0, 0.45, vDim);

        // cull inactive neurons in activity-only modes by collapsing them
        float hide = uActiveOnly * step(aActivation, 0.02) * (1.0 - vPicked);
        size *= (1.0 - hide);

        gl_PointSize = size * uPixelRatio * (300.0 / max(-mv.z, 0.001));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uInactive;
      uniform vec3 uActive;
      uniform vec3 uSpike;
      uniform vec3 uSelectColor;
      uniform float uHasActivity;

      varying float vActivation;
      varying float vPicked;
      varying float vDim;

      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        if (r > 1.0) discard;

        // soft core with a falloff; no texture needed
        float core = smoothstep(1.0, 0.0, r);
        float glow = pow(core, 2.4);

        vec3 color = uInactive;
        float a = 0.42;

        if (uHasActivity > 0.5) {
          color = mix(uInactive, uActive, smoothstep(0.02, 0.45, vActivation));
          color = mix(color, uSpike, smoothstep(0.65, 1.0, vActivation));
          a = mix(0.30, 1.0, vActivation);
        }

        // SPIKING gets a ring as well as brightness: a shape cue, so the state
        // is legible without relying on colour discrimination
        float ring = 0.0;
        if (uHasActivity > 0.5 && vActivation > 0.82) {
          ring = smoothstep(0.62, 0.78, r) * smoothstep(0.98, 0.84, r);
          color += uSpike * ring * 1.2;
          a = max(a, ring);
        }

        if (vPicked > 0.01) {
          float sel = smoothstep(0.55, 0.72, r) * smoothstep(1.0, 0.82, r);
          color = mix(color, uSelectColor, max(sel, 0.35) * vPicked);
          a = max(a, sel * vPicked);
        }

        a *= mix(1.0, 0.18, vDim);
        a *= uOpacity * max(glow, ring);
        if (a < 0.004) discard;
        gl_FragColor = vec4(color, a);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Synaptic connections.
 *
 * Drawn as GL lines with per-vertex weight and sign. Depth-fading keeps the
 * far side of the brain from fogging the near side into illegibility, which is
 * the usual failure mode for dense connectome renders.
 */
export function createConnectionMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uExcitatory: new Uniform(new Color('#3fbf9c')),
      uInhibitory: new Uniform(new Color('#e2566f')),
      uOpacity: new Uniform(0.22),
      uNear: new Uniform(10),
      uFar: new Uniform(45),
    },
    vertexShader: /* glsl */ `
      attribute float aWeight;   // 0..1, normalised measured synapse count
      attribute float aSign;     // +1 excitatory, -1 inhibitory
      attribute float aHighlight;

      varying float vWeight;
      varying float vSign;
      varying float vHighlight;
      varying float vDepth;

      void main() {
        vWeight = aWeight;
        vSign = aSign;
        vHighlight = aHighlight;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uExcitatory;
      uniform vec3 uInhibitory;
      uniform float uOpacity;
      uniform float uNear;
      uniform float uFar;

      varying float vWeight;
      varying float vSign;
      varying float vHighlight;
      varying float vDepth;

      void main() {
        vec3 color = vSign > 0.0 ? uExcitatory : uInhibitory;
        float depthFade = 1.0 - smoothstep(uNear, uFar, vDepth);
        float a = uOpacity * (0.25 + vWeight * 0.75) * (0.35 + depthFade * 0.65);
        color = mix(color, vec3(1.0, 0.85, 0.45), vHighlight);
        a = mix(a, 0.95, vHighlight);
        if (a < 0.004) discard;
        gl_FragColor = vec4(color, a);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Travelling spike pulses.
 *
 * Positions are interpolated on the CPU from the real spike times, so a pulse
 * leaves a neuron when that neuron actually fired in the simulation. The
 * travel time is exaggerated relative to the model's 1.8 ms axonal delay,
 * because 1.8 ms of model time is a few milliseconds of wall clock and would
 * be invisible; the UI states the exaggeration factor.
 */
export function createPulseMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uPixelRatio: new Uniform(1),
      uSize: new Uniform(7.0),
      uExcitatory: new Uniform(new Color('#b8ffe9')),
      uInhibitory: new Uniform(new Color('#ffc2cf')),
      uOpacity: new Uniform(0.9),
    },
    vertexShader: /* glsl */ `
      attribute float aProgress;  // 0 at the presynaptic end, 1 at the target
      attribute float aSign;

      uniform float uPixelRatio;
      uniform float uSize;

      varying float vProgress;
      varying float vSign;

      void main() {
        vProgress = aProgress;
        vSign = aSign;

        // aProgress is set to -1 for every synapse whose presynaptic neuron is
        // not currently firing, which is the vast majority on any given frame.
        // Collapsing them here is cheaper than rebuilding the buffer.
        if (aProgress < 0.0 || aProgress > 1.0) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          return;
        }

        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // brightest mid-flight, fading in at the soma and out at the target
        float envelope = sin(aProgress * 3.14159);
        gl_PointSize = uSize * (0.45 + envelope) * uPixelRatio * (300.0 / max(-mv.z, 0.001));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uExcitatory;
      uniform vec3 uInhibitory;
      uniform float uOpacity;
      varying float vProgress;
      varying float vSign;

      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        if (r > 1.0) discard;
        float core = pow(smoothstep(1.0, 0.0, r), 2.0);
        float envelope = sin(clamp(vProgress, 0.0, 1.0) * 3.14159);
        vec3 color = vSign > 0.0 ? uExcitatory : uInhibitory;
        float a = core * envelope * uOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(color, a);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Brain compartment shells.
 *
 * Deliberately faint and wireframe-ish: these are the illustrative scaffold
 * from preprocess/anatomy.py, and must never look more authoritative than the
 * measured neurons inside them.
 */
export function createCompartmentMaterial(color: string): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uColor: new Uniform(new Color(color)),
      uOpacity: new Uniform(0.12),
      uSelected: new Uniform(0),
    },
    vertexShader: /* glsl */ `
      varying vec3 vViewNormal;
      varying vec3 vViewPos;
      void main() {
        vViewNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSelected;
      varying vec3 vViewNormal;
      varying vec3 vViewPos;
      void main() {
        float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPos)));
        float rim = pow(1.0 - facing, 2.6);
        float a = (rim * 0.9 + 0.04) * uOpacity * (1.0 + uSelected * 3.0);
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * (1.0 + uSelected), a);
      }
    `,
  });
}
