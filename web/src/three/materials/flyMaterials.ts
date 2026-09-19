/**
 * Materials for the fly's external anatomy.
 *
 * Two ideas run through all of them:
 *
 * 1. Fresnel-weighted transparency. When the body fades for X-ray mode the
 *    silhouette must survive, otherwise the fly stops being recognisable the
 *    moment you look inside it. Every body material keeps its grazing-angle
 *    edges near-opaque while the facing surfaces dissolve, which reads as
 *    looking *into* a solid object rather than as the object being deleted.
 *
 * 2. Ommatidia are shaded, not modelled. ~750 facets per eye as geometry would
 *    be 1,500 extra draw primitives for something that is essentially a
 *    surface pattern; the hex tiling below costs one fragment shader.
 */

import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  MeshPhysicalMaterial,
  ShaderMaterial,
  Uniform,
} from 'three';

/** Shared GLSL: hexagonal tiling used for the ommatidial lattice. */
const HEX_GLSL = /* glsl */ `
  const vec2 HEX_S = vec2(1.0, 1.7320508);

  // Returns xy = offset from the nearest hex centre, zw = that centre's id.
  vec4 hexCell(vec2 p) {
    vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / HEX_S.xyxy) + 0.5;
    vec4 h = vec4(p - hC.xy * HEX_S, p - (hC.zw + 0.5) * HEX_S);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw)
      ? vec4(h.xy, hC.xy)
      : vec4(h.zw, hC.zw + 0.5);
  }

  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(HEX_S)), p.x);
  }

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(41.7, 289.1))) * 43758.5453);
  }
`;

// ---------------------------------------------------------------------------
// cuticle
// ---------------------------------------------------------------------------

export interface CuticleOptions {
  color: number;
  roughness?: number;
  metalness?: number;
  /** Extra sheen on the dorsal surfaces. */
  clearcoat?: number;
  /**
   * Tergite pigment bands, for the abdomen.
   *
   * Number of segments to band along the surface's v axis. A Drosophila
   * abdomen is read as much by its dark posterior stripes as by its shape, and
   * geometry alone gives only a faint seam.
   */
  bands?: number;
}

/**
 * Chitinous body surface.
 *
 * MeshPhysicalMaterial gives believable cuticle out of the box; the injected
 * chunk adds the fresnel-weighted fade described above, driven by a uniform the
 * X-ray slider writes to.
 */
export function createCuticleMaterial(options: CuticleOptions): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: new Color(options.color),
    roughness: options.roughness ?? 0.55,
    metalness: options.metalness ?? 0.12,
    clearcoat: options.clearcoat ?? 0.35,
    clearcoatRoughness: 0.45,
    transparent: true,
    depthWrite: true,
    side: FrontSide,
  });

  const uniforms = {
    uFade: new Uniform(0),
    uRimBoost: new Uniform(1.6),
    uBands: new Uniform(options.bands ?? 0),
  };
  material.userData.uniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = uniforms.uFade;
    shader.uniforms.uRimBoost = uniforms.uRimBoost;
    shader.uniforms.uBands = uniforms.uBands;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vViewNormal;
         varying vec3 vViewPos;
         varying vec2 vBandUv;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vViewNormal = normalize(normalMatrix * objectNormal);
         vViewPos = (modelViewMatrix * vec4(transformed, 1.0)).xyz;
         // three declares the uv attribute for every non-raw material, but
         // only forwards it as a varying when a texture is bound -- and none
         // is, so the banding carries its own.
         vBandUv = uv;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uFade;
         uniform float uRimBoost;
         uniform float uBands;
         varying vec3 vViewNormal;
         varying vec3 vViewPos;
         varying vec2 vBandUv;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         if (uBands > 0.5) {
           // Dark band across the posterior of each tergite. vBandUv.y runs
           // the length of the abdomen loft, 0 at the thorax and 1 at the tip.
           float seg = fract(vBandUv.y * uBands);
           float band = smoothstep(0.52, 0.80, seg) * smoothstep(1.0, 0.86, seg);
           // the stripes deepen toward the tip, as the pigment does
           band *= mix(0.55, 1.0, vBandUv.y);
           diffuseColor.rgb *= mix(1.0, 0.34, band);
         }`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         // grazing angles stay opaque so the silhouette survives the fade
         float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPos)));
         float rim = pow(1.0 - facing, 2.2);
         float keep = clamp(rim * uRimBoost, 0.0, 1.0);
         float alpha = mix(1.0, keep, uFade);
         gl_FragColor.a *= alpha;
         // and the rim itself brightens slightly, like a lit edge
         gl_FragColor.rgb += vec3(0.16, 0.22, 0.30) * rim * uFade;
         if (gl_FragColor.a < 0.004) discard;`,
      );
  };

  return material;
}

/** Push a new X-ray amount into a cuticle material. */
export function setCuticleFade(material: MeshPhysicalMaterial, fade: number): void {
  const uniforms = material.userData.uniforms as { uFade: Uniform } | undefined;
  if (uniforms) uniforms.uFade.value = fade;
  material.depthWrite = fade < 0.5;
}

// ---------------------------------------------------------------------------
// compound eye
// ---------------------------------------------------------------------------

/**
 * Compound eye with a procedural ommatidial lattice.
 *
 * The surface is parameterised by its own spherical coordinates, so the hex
 * grid wraps the curvature instead of sliding across it. Each facet gets a
 * slightly different tint and its own specular dot, which is what makes a
 * compound eye read as hundreds of tiny lenses rather than a textured ball.
 */
export function createCompoundEyeMaterial(facetCount: number): ShaderMaterial {
  /**
   * Cells per radian of the eye's spherical parameterisation.
   *
   * The lattice is laid over the whole sphere but only the outward-facing half
   * is ever seen, so the sphere has to carry 2x facetCount for the eye to show
   * facetCount. With hex spacing HEX_S the sphere holds
   *   (2*PI*d) * (PI*d / 1.7320508)  ~=  11.4 d^2
   * cells, so d = sqrt(2 * facetCount / 11.4) = 0.419 * sqrt(facetCount).
   */
  const density = Math.sqrt(facetCount) * 0.419;

  return new ShaderMaterial({
    transparent: true,
    side: FrontSide,
    uniforms: {
      uDensity: new Uniform(density),
      uBase: new Uniform(new Color('#7c1d1d')),
      uHighlight: new Uniform(new Color('#ff8a6b')),
      uDeep: new Uniform(new Color('#2a0708')),
      uFade: new Uniform(0),
      uTime: new Uniform(0),
      uSelected: new Uniform(0),
    },
    vertexShader: /* glsl */ `
      // Direction on the eye's own unit sphere, supplied by
      // buildEyeGeometry(). Using \`position\` here instead would parameterise
      // the lattice by the vertex's location in fly space, where the whole eye
      // subtends well under a radian and the hex grid degenerates into a few
      // huge cells rather than ~750 facets.
      attribute vec3 aLocal;

      varying vec3 vLocal;
      varying vec3 vViewNormal;
      varying vec3 vViewPos;

      void main() {
        vLocal = normalize(aLocal);
        vViewNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${HEX_GLSL}

      uniform float uDensity;
      uniform vec3 uBase;
      uniform vec3 uHighlight;
      uniform vec3 uDeep;
      uniform float uFade;
      uniform float uSelected;

      varying vec3 vLocal;
      varying vec3 vViewNormal;
      varying vec3 vViewPos;

      void main() {
        // spherical parameterisation of the eye surface
        float theta = atan(vLocal.z, vLocal.x);
        float phi = acos(clamp(vLocal.y, -1.0, 1.0));
        vec2 uv = vec2(theta * sin(phi), phi) * uDensity;

        vec4 cell = hexCell(uv);
        float d = hexDist(cell.xy);
        // lens body vs the dark chitin between facets
        float lens = smoothstep(0.52, 0.34, d);
        float seam = smoothstep(0.30, 0.52, d);

        float jitter = hash21(cell.zw);
        vec3 facet = mix(uBase, uHighlight, jitter * 0.35);
        vec3 color = mix(uDeep, facet, lens);

        vec3 N = normalize(vViewNormal);
        vec3 V = normalize(-vViewPos);
        float facing = clamp(dot(N, V), 0.0, 1.0);

        // each lens catches its own highlight near its centre
        float lensSpec = pow(1.0 - d * 1.7, 6.0) * lens;
        color += uHighlight * lensSpec * 0.55 * (0.4 + jitter * 0.6);

        // pseudopupil: the dark spot that tracks the viewer in a real eye
        float pupil = pow(facing, 14.0);
        color = mix(color, uDeep * 0.6, pupil * 0.55);

        float rim = pow(1.0 - facing, 2.5);
        color += vec3(0.35, 0.12, 0.10) * rim;
        color = mix(color, color * 0.6, seam * 0.4);

        color += vec3(1.0, 0.82, 0.45) * uSelected * (0.25 + rim * 0.5);

        float alpha = mix(1.0, clamp(rim * 1.9, 0.0, 1.0), uFade);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// wing
// ---------------------------------------------------------------------------

/**
 * Wing membrane: near-invisible face-on, visible at grazing angles, with a
 * faint thin-film tint. Real fly wings are almost pure transmission, so any
 * opaque treatment immediately looks wrong.
 */
export function createWingMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    uniforms: {
      uOpacity: new Uniform(0.17),
      uTint: new Uniform(new Color('#9fd8ff')),
      uIridescence: new Uniform(new Color('#ffb0e8')),
      uFade: new Uniform(0),
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vViewNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uTint;
      uniform vec3 uIridescence;
      uniform float uFade;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewPos;

      void main() {
        vec3 N = normalize(vViewNormal);
        vec3 V = normalize(-vViewPos);
        float facing = abs(dot(N, V));
        float rim = pow(1.0 - facing, 1.7);

        // thin-film style shift across the membrane
        float film = sin(vUv.y * 9.0 + vUv.x * 4.0) * 0.5 + 0.5;
        vec3 color = mix(uTint, uIridescence, film * rim);

        float alpha = (uOpacity + rim * 0.5) * (1.0 - uFade * 0.75);
        // the trailing edge fades out so the wing has no hard cut
        alpha *= smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        alpha *= smoothstep(0.0, 0.03, vUv.x);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Wing veins: thin, slightly darker than the membrane. */
export function createVeinMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: new Uniform(new Color('#cfe6f5')),
      uOpacity: new Uniform(0.42),
      uFade: new Uniform(0),
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uFade;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity * (1.0 - uFade * 0.8));
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// head capsule interior
// ---------------------------------------------------------------------------

/**
 * Inner shell of the head, drawn back-face only.
 *
 * Gives the brain a sense of enclosure once the outer cuticle has faded:
 * without it the neurons appear to hang in empty space rather than inside a
 * head. Only visible when X-ray is engaged.
 */
export function createHeadInteriorMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    side: BackSide,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uColor: new Uniform(new Color('#2b4a63')),
      uFade: new Uniform(0),
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
      uniform float uFade;
      varying vec3 vViewNormal;
      varying vec3 vViewPos;
      void main() {
        float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPos)));
        float rim = pow(1.0 - facing, 2.0);
        float alpha = rim * 0.5 * uFade;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}
