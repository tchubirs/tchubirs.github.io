import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  RedFormat,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
} from '@iwsdk/core';

/** Physical dimensions of the simulated scroll, in metres. */
export const SHEET = {
  length: 1.2, // unrolled length of the sheet (along local +X when flat)
  height: 0.22, // height of the roll (along local Z, the roll axis)
  turnGap: 0.002, // radial distance between successive turns
  coreRadius: 0.006, // radius of the innermost turn
  segmentsS: 800,
  segmentsZ: 24,
} as const;

/** Radius of the turn that the sheet point at arc position `s` sits on. */
export function turnRadius(s: number): number {
  const remaining = Math.max(0, SHEET.length - s);
  return Math.sqrt(SHEET.coreRadius ** 2 + (remaining * SHEET.turnGap) / Math.PI);
}

/**
 * A grid over (s, z). Positions are computed in the vertex shader from `aS`
 * and `aZ`, so the CPU-side bounding volume is set by hand to cover the
 * flat sheet plus the roll.
 */
export function createSheetGeometry(): BufferGeometry {
  const { segmentsS: ns, segmentsZ: nz } = SHEET;
  const count = (ns + 1) * (nz + 1);
  const aS = new Float32Array(count);
  const aZ = new Float32Array(count);
  const aR = new Float32Array(count);
  const uv = new Float32Array(count * 2);
  const position = new Float32Array(count * 3);
  let i = 0;
  for (let iz = 0; iz <= nz; iz++) {
    for (let is = 0; is <= ns; is++) {
      const s = (is / ns) * SHEET.length;
      const z = (iz / nz - 0.5) * SHEET.height;
      aS[i] = s;
      aZ[i] = z;
      aR[i] = turnRadius(s);
      uv[i * 2] = s / SHEET.length;
      // Far edge (-z) is the top of the text for someone seated in front.
      uv[i * 2 + 1] = 1 - iz / nz;
      position[i * 3] = s;
      position[i * 3 + 2] = z;
      i++;
    }
  }
  const index = new Uint32Array(ns * nz * 6);
  let k = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let is = 0; is < ns; is++) {
      const a = iz * (ns + 1) + is;
      const b = a + 1;
      const c = a + (ns + 1);
      const d = c + 1;
      index.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('aS', new BufferAttribute(aS, 1));
  g.setAttribute('aZ', new BufferAttribute(aZ, 1));
  g.setAttribute('aR', new BufferAttribute(aR, 1));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingBox();
  g.boundingBox!.min.set(-0.1, -0.01, -SHEET.height);
  g.boundingBox!.max.set(SHEET.length + 0.1, 0.1, SHEET.height);
  g.computeBoundingSphere();
  return g;
}

const vertexShader = /* glsl */ `
  attribute float aS;
  attribute float aZ;
  attribute float aR;
  uniform float uUnroll;   // metres of sheet lying flat
  uniform float uRollR;    // radius of the outermost remaining turn
  uniform float uTurnGap;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vFlat;

  // Cheap value noise for the charred, blistered surface.
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vUv = uv;
    vec2 p;       // cross-section position: x along the table, y up
    vec2 n;       // normal of the written (recto) face
    if (aS <= uUnroll) {
      p = vec2(aS, 0.0);
      n = vec2(0.0, 1.0);
      vFlat = 1.0;
    } else {
      // Carpet unroll: the roll rests on the table at x = uUnroll. A point
      // further in is wound (2*pi/gap)*(R - r) radians around the centre.
      float beta = 6.28318530718 / uTurnGap * (uRollR - aR);
      vec2 centre = vec2(uUnroll, uRollR);
      p = centre + aR * vec2(sin(beta), -cos(beta));
      n = vec2(-sin(beta), cos(beta));
      vFlat = 0.0;
    }
    float blister = (noise(vec2(aS * 90.0, aZ * 90.0)) - 0.5) * 0.0012
                  + (noise(vec2(aS * 13.0, aZ * 13.0)) - 0.5) * 0.0018;
    vec3 local = vec3(p.x, p.y, aZ) + vec3(n.x, n.y, 0.0) * blister;
    vNormal = normalize(mat3(modelMatrix) * vec3(n.x, n.y, 0.0));
    vec4 world = modelMatrix * vec4(local, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uInk;      // letters, white on black
  uniform sampler2D uReveal;   // where a palm has swept
  uniform vec3 uLightDir;
  uniform vec3 uGlow;
  uniform vec4 uPalms[2];     // per hand: (s, z, strength, unused)
  uniform float uPalmR;       // radius of the scanned disc, metres
  uniform vec3 uScan;         // colour of the scanner light
  uniform vec4 uTarget;       // box of the target word in uv
  uniform float uFound;       // 0 until found, then rises to 1
  uniform float uTime;
  uniform vec2 uSize;         // sheet length, height
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vFlat;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec3 nrm = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    // Papyrus fibres: long horizontal strands over short vertical ones.
    float fibre = noise(vec2(vUv.x * 900.0, vUv.y * 40.0)) * 0.55
                + noise(vec2(vUv.x * 60.0, vUv.y * 400.0)) * 0.45;
    vec3 base = mix(vec3(0.045, 0.032, 0.024), vec3(0.11, 0.075, 0.05), fibre);
    base *= 0.8 + 0.4 * noise(vUv * vec2(40.0, 8.0));
    float diffuse = max(dot(nrm, normalize(uLightDir)), 0.0);
    vec3 colour = base * (0.35 + 0.9 * diffuse);
    // Ink shows only on the flat, recto face and only where it was revealed.
    float ink = texture2D(uInk, vUv).r;
    float seen = texture2D(uReveal, vUv).r * vFlat * (gl_FrontFacing ? 1.0 : 0.0);
    colour = mix(colour, uGlow, ink * seen);
    colour += uGlow * 0.05 * seen;   // faint trace of where the palm has passed

    // Scanner light under each palm: a soft disc with a thin bright rim.
    float face = vFlat * (gl_FrontFacing ? 1.0 : 0.0);
    vec2 sz = vec2(vUv.x * uSize.x, (0.5 - vUv.y) * uSize.y);
    float light = 0.0;
    float rim = 0.0;
    for (int i = 0; i < 2; i++) {
      float d = distance(sz, uPalms[i].xy);
      light = max(light, uPalms[i].z * (1.0 - smoothstep(uPalmR * 0.3, uPalmR * 1.4, d)));
      rim = max(rim, uPalms[i].z * (1.0 - smoothstep(0.0, 0.0022, abs(d - uPalmR))));
    }
    light *= face;
    rim *= face;
    colour += uScan * (light * 0.16 + rim * 0.55);
    colour = mix(colour, uGlow * 1.3, ink * light * 0.85);

    // Once found, the target word breathes.
    vec2 inBox = step(uTarget.xy, vUv) * step(vUv, uTarget.zw);
    float word = inBox.x * inBox.y * uFound * (0.7 + 0.3 * sin(uTime * 4.0));
    colour = mix(colour, vec3(1.0, 0.94, 0.78), ink * seen * word);
    gl_FragColor = vec4(colour, 1.0);
  }
`;

export interface SheetMaterial extends ShaderMaterial {
  uniforms: {
    uUnroll: { value: number };
    uRollR: { value: number };
    uTurnGap: { value: number };
    uInk: { value: CanvasTexture };
    uReveal: { value: DataTexture };
    uLightDir: { value: Vector3 };
    uGlow: { value: Color };
    uPalms: { value: [Vector4, Vector4] };
    uPalmR: { value: number };
    uScan: { value: Color };
    uTarget: { value: Vector4 };
    uFound: { value: number };
    uTime: { value: number };
    uSize: { value: Vector2 };
  };
}

export function createSheetMaterial(ink: CanvasTexture, reveal: DataTexture): SheetMaterial {
  ink.colorSpace = SRGBColorSpace;
  const m = new ShaderMaterial({
    uniforms: {
      uUnroll: { value: 0 },
      uRollR: { value: turnRadius(0) },
      uTurnGap: { value: SHEET.turnGap },
      uInk: { value: ink },
      uReveal: { value: reveal },
      uLightDir: { value: new Vector3(0.3, 1, 0.4) },
      uGlow: { value: new Color(1.0, 0.72, 0.32) },
      uPalms: { value: [new Vector4(), new Vector4()] },
      uPalmR: { value: 0.035 },
      uScan: { value: new Color(0.55, 0.85, 1.0) },
      uTarget: { value: new Vector4(-1, -1, -1, -1) },
      uFound: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: new Vector2(SHEET.length, SHEET.height) },
    },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
  });
  return m as SheetMaterial;
}

/** Reveal mask: one byte per texel over the sheet's (s, z) parameter space. */
export function createRevealTexture(width: number, height: number): DataTexture {
  const t = new DataTexture(new Uint8Array(width * height), width, height, RedFormat);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}
