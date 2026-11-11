import { MAX_ORBS, MAX_STOPS } from './params';

export const VERTEX = /* glsl */ `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`;

/**
 * One full-screen pass. For every orb: a noise-wobbled circular mask with a grain-dissolved
 * edge, a domain-warped fBm colour field mapped through an OKLab palette, OKLCh grading,
 * soft spherical lighting, then grain and optional dithering. Orbs composite back to front.
 */
export const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

#define MAX_ORBS ${MAX_ORBS}
#define MAX_STOPS ${MAX_STOPS}

uniform vec2 uRes;
uniform float uPx;            // device px per reference px — keeps grain size resolution independent
uniform vec4 uOrbA[MAX_ORBS]; // centre x, centre y, radius, aspect
uniform vec4 uOrbB[MAX_ORBS]; // field offset x, y, palette offset, rotation
uniform int uOrbCount;
uniform vec3 uPalette[MAX_STOPS]; // OKLab
uniform int uStops;
uniform float uEdge, uDistort;
uniform float uBlend, uContrast, uSat, uBright, uHue;
uniform float uGrain, uGrainScale, uFreq, uOctaves, uWarp, uSoft, uDither;
uniform vec2 uLight;
uniform float uLightI, uShadowSoft, uShading, uDepth;
uniform vec2 uLoop;           // cos / sin of the loop phase
uniform vec2 uFlow;           // unit flow direction
uniform float uTurb, uMorph;
uniform vec2 uField;          // dragged offset of the colour field
uniform vec3 uPtr;            // pointer x, y, strength
uniform vec2 uPtrVel;
uniform sampler2D uImage;
uniform int uImageMode;       // 0 off, 1 colour field, 2 warp source
uniform float uImageAmt;
uniform vec2 uImageScale;     // cover-fit of the image onto the frame
uniform vec3 uBg;
uniform float uBgAlpha;
uniform float uSeed;

// --- simplex noise (Ashima Arts / Stefan Gustavson, MIT) ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// fBm with a fractional octave count, so complexity changes smoothly.
float fbm(vec3 p, float octaves, float gain) {
  float amp = 0.5, sum = 0.0, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    float w = clamp(octaves - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    sum += amp * w * snoise(p);
    norm += amp * w;
    p = p * 2.02 + vec3(17.13, 9.31, 3.71);
    amp *= gain;
  }
  return sum / max(norm, 1e-4);
}

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// --- colour ---
vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 linearToOklab(vec3 c) {
  float l = pow(max(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b, 0.0), 1.0 / 3.0);
  float m = pow(max(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b, 0.0), 1.0 / 3.0);
  float s = pow(max(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}

// Palette ramp in OKLab. Blend 1 = continuous, 0 = posterized patches.
vec3 palette(float t) {
  float n = float(uStops - 1);
  float x = clamp(t, 0.0, 1.0) * n;
  float i = min(floor(x), n - 1.0);
  float f = x - i;
  float k = smoothstep(0.5 - uBlend * 0.5, 0.5 + uBlend * 0.5 + 1e-4, f);
  int a = int(i);
  int b = min(a + 1, uStops - 1);
  return mix(uPalette[a], uPalette[b], k);
}

vec2 rot(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// Returns premultiplied colour (linear) + coverage for one orb.
vec4 orb(vec2 uv, vec2 uvField, int i, float grainN) {
  vec4 A = uOrbA[i];
  vec4 B = uOrbB[i];

  vec2 q = rot(uv - A.xy, -B.w);
  q.x /= A.w;
  q /= A.z;
  float rr = length(q);

  // Loop-aware time: the field travels around a closed path through noise space.
  vec2 perp = vec2(-uFlow.y, uFlow.x);
  vec3 tl = vec3(uFlow * uLoop.x + perp * uLoop.y * 0.35, uLoop.y * 0.6) * uMorph;

  // Irregular silhouette from angular noise.
  float ang = atan(q.y, q.x);
  vec3 ap = vec3(cos(ang), sin(ang), 0.0) * 1.2 + vec3(B.xy * 0.37, 0.0) + tl * 0.5;
  float wob = 0.65 * snoise(ap) + 0.35 * snoise(ap * 2.3 + 4.1);
  float r = rr * (1.0 + uDistort * 0.24 * wob);

  float edge = max(uEdge, 0.002);
  float m = 1.0 - smoothstep(1.0 - edge, 1.0 + edge * 0.2, r + (grainN - 0.5) * uGrain * edge * 1.8);
  if (m <= 0.002) return vec4(0.0);

  // Sphere for shading and for the bulging colour field.
  vec2 qs = q / max(1.0 + uDistort * 0.24 * wob, 0.5);
  float z = sqrt(max(0.0, 1.0 - min(dot(qs, qs), 1.0)));
  vec3 n = normalize(vec3(qs, z + 0.15));

  vec2 qf = rot(uvField - A.xy, -B.w);
  qf.x /= A.w;
  qf /= A.z;
  vec2 fp = qf * (1.0 + uDepth * 0.9 * (1.0 - z));
  vec2 p = fp * uFreq + B.xy + uField;

  float gain = mix(0.58, 0.4, uSoft);
  float oct = uOctaves;
  // Softness strips fine octaves from the colour field, leaving broad, airy patches.
  float octColor = max(1.0, mix(oct, 1.6, uSoft));

  if (uImageMode == 2) {
    vec2 iuv = clamp(uv * uImageScale + 0.5, 0.0, 1.0);
    vec3 img = texture(uImage, iuv).rgb;
    p += uImageAmt * 2.4 * (img.rg - img.gb);
  }

  // Two-level domain warp (q, then r) in the spirit of Inigo Quilez.
  // Primary warp stays broad; fine detail only enters through turbulence.
  float octWarp = min(oct, 3.0);
  vec2 w1 = vec2(fbm(vec3(p * 0.7, 0.0) + tl, octWarp, gain), fbm(vec3(p * 0.7 + vec2(5.2, 1.3), 0.0) + tl * 1.1, octWarp, gain));
  vec2 w2 = vec2(fbm(vec3(p + 1.8 * w1 + vec2(1.7, 9.2), 1.7) - tl * 0.7, oct, gain),
                 fbm(vec3(p + 1.8 * w1 + vec2(8.3, 2.8), 1.7) - tl * 0.7, oct, gain));
  vec2 pw = p + uWarp * (1.3 * w1 + uTurb * 1.2 * w2);

  float f = fbm(vec3(pw * 0.6, 3.1) + tl * 0.5, octColor, gain) * 0.5 + 0.5;
  float g = fbm(vec3(pw * 0.35 + 11.0, 5.3) - tl * 0.3, max(octColor - 1.0, 1.0), gain) * 0.5 + 0.5;
  float t = f + (g - 0.5) * 0.8;
  // A broad ramp across the sphere, aligned with the light, carries colour across the whole orb.
  vec2 ld = normalize(uLight + vec2(1e-4));
  float ramp = dot(qs + w1 * 0.25 * uWarp, -ld) * 0.5 + 0.5;
  t = mix(t, ramp, 0.38 * (1.0 - 0.5 * uTurb));
  t = (t - 0.5) * uContrast * 1.3 + 0.5 + B.z;
  t = 1.0 - abs(1.0 - mod(t, 2.0)); // mirrored wrap: palette offsets without seams

  vec3 lab = palette(t);
  if (uImageMode == 1) {
    vec2 iuv = clamp(uv * uImageScale + 0.5 + (pw - p) * 0.04, 0.0, 1.0);
    vec3 img = linearToOklab(srgbToLinear(texture(uImage, iuv).rgb));
    lab = mix(lab, img, uImageAmt);
  }

  // Grade in OKLCh: hue rotation, chroma and lightness.
  lab.yz = rot(lab.yz, radians(uHue)) * uSat;
  lab.x *= uBright;

  // Atmospheric rim: lift and desaturate slightly toward the edge.
  float rim = smoothstep(0.55, 1.0, rr);
  lab.x += rim * uDepth * 0.08;

  vec3 col = max(oklabToLinear(lab), 0.0);

  // Soft lighting — a diffuse terminator and a broad sheen, never a glossy highlight.
  vec3 L = normalize(vec3(uLight.x, uLight.y, 0.9));
  float nd = dot(n, L);
  float shade = smoothstep(-0.25 - uShadowSoft * 0.95, 1.0, nd);
  col *= mix(1.0, 0.18 + 1.0 * shade, uShading);
  float sheen = pow(max(nd, 0.0), mix(2.5, 9.0, 1.0 - uShadowSoft));
  col += uLightI * 0.22 * sheen * (0.6 + 0.4 * col);

  return vec4(col * m, m);
}

// =====================================================================
// LIQUID material — a raymarched, deformable glass body with an internal
// liquid. Camera, backdrop and environment are analytic, so refraction,
// reflection and dispersion stay exact, cheap and temporally stable.
// =====================================================================

uniform int uMaterial;        // 0 gradient, 1 liquid
uniform vec4 uGlass;          // ior, roughness, transmission, fresnel
uniform vec4 uGlass2;         // dispersion, density, clearcoat, normal distortion
uniform vec4 uLiquid;         // fill, meniscus, wave strength, wave frequency
uniform float uLiquidAbsorb;
uniform vec4 uSlosh;          // tilt, bob, energy, idle sway
uniform vec4 uShape;          // wobble, wobble frequency, tension, breathing
uniform vec4 uDeform;         // stretch x, stretch y, drag x, drag y (frame units, y down)
uniform vec4 uLightFx;        // reflection, rim, bloom, exposure
uniform vec2 uLightFx2;       // specular, edge highlight
uniform vec4 uEnv;            // horizon y, horizon glow, grid, beam
uniform int uEnvImage;        // backdrop is the uploaded image
uniform vec3 uColors[6];      // linear: glass tint, liquid, rim, env top, env horizon, env bottom

#define GLASS_TINT uColors[0]
#define LIQUID_COL uColors[1]
#define RIM_COL uColors[2]
#define ENV_TOP uColors[3]
#define ENV_HOR uColors[4]
#define ENV_BOT uColors[5]

const float CAM_Z = 4.0;
const float HALF = 0.72;      // world half-extent of the frame at z = 0
const float BG_DIST = 1.6;    // backdrop plane behind the orb

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// The scene behind the orb, in frame units (y down). blur widens every feature.
// Refracted and reflected rays (seen = true) also see a soft light hidden behind the
// orb, which focuses into the bright transmitted highlight that clear glass shows.
vec3 backdrop(vec2 b, float blur, bool seen) {
  if (uEnvImage == 1) {
    vec2 iuv = clamp(b * uImageScale + 0.5, 0.0, 1.0);
    return srgbToLinear(textureLod(uImage, iuv, blur * 7.0).rgb);
  }
  float h = uEnv.x;
  float soft = 0.2 + blur * 0.35;
  vec3 col = mix(ENV_TOP, ENV_BOT, smoothstep(h - soft, h + soft, b.y));
  float bw = 0.03 + blur * 0.14;
  col += ENV_HOR * uEnv.y * exp(-pow((b.y - h) / bw, 2.0));
  // studio falloff toward the key light
  vec2 lp = uLight * 0.55;
  col *= 0.78 + 0.42 * exp(-dot(b - lp, b - lp) * 1.6);
  // grid
  if (uEnv.z > 0.0) {
    float cell = 0.22;
    vec2 g = abs(fract(b / cell + 0.5) - 0.5) * cell;
    float w = 0.0012 + blur * 0.012;
    float line = 1.0 - smoothstep(0.0, w, min(g.x, g.y));
    col = mix(col, col * 0.55, line * uEnv.z * (1.0 - blur));
  }
  // overhead beam
  if (uEnv.w > 0.0) {
    float spread = 0.07 + (b.y + 0.5) * 0.16 + blur * 0.2;
    float beam = exp(-pow(b.x / spread, 2.0)) * smoothstep(0.55, -0.55, b.y);
    col += mix(vec3(1.0), ENV_HOR, 0.3) * uEnv.w * beam * 0.55;
  }
  col *= max(1.0 - 0.28 * dot(b, b), 0.35);
  if (seen) {
    vec2 hp = uLight * 0.22;
    col += mix(vec3(1.0), ENV_HOR, 0.15) * uLightFx2.x * 0.9 * exp(-dot(b - hp, b - hp) / (0.012 + blur * 0.05));
  }
  return col;
}

// Reflection environment: a sky / ground dome with large softboxes; the backdrop behind.
vec3 envLight(vec3 d, float rough, vec3 from, bool lights) {
  vec3 sky = mix(ENV_BOT, ENV_TOP, smoothstep(-0.3, 0.45, d.y)) * 0.75;
  // the dome always carries a horizon ring, so edges pick up the horizon colour as arcs
  sky += ENV_HOR * ((lights ? 0.45 : 0.0) + uEnv.y) * exp(-pow(d.y / (0.07 + rough * 0.3), 2.0)) * 0.8;
  vec3 L = normalize(vec3(uLight.x, -uLight.y, 0.85));
  // Round area lights: a soft key disc and a broad, dim fill opposite it. Discs map to
  // smooth, rounded highlights on curved glass, never hard-edged slabs.
  float s = 0.04 + rough * 0.45;
  float aKey = acos(clamp(dot(d, L), -1.0, 1.0));
  float key = smoothstep(0.32 + s, 0.32 - s * 0.6 - 0.04, aKey);
  vec3 F = normalize(vec3(-L.x, -L.y * 0.4 + 0.1, 0.5));
  float aFill = acos(clamp(dot(d, F), -1.0, 1.0));
  float fill = smoothstep(0.7 + s, 0.2, aFill);
  float spec = lights ? uLightFx2.x : 0.0;
  vec3 e = sky + vec3(1.0) * key * 2.2 * spec * mix(1.0, 0.4, rough) + vec3(1.0) * fill * 0.5 * spec * mix(1.0, 0.5, rough);
  // rays heading away from the camera see the backdrop
  // Only rays that actually reach the plane see it; grazing rays fade to the dome.
  if (d.z < -0.02) {
    float t = (-BG_DIST - from.z) / d.z;
    vec3 P = from + d * max(t, 0.0);
    vec2 b = vec2(P.x, -P.y) * CAM_Z / (CAM_Z + BG_DIST) / (2.0 * HALF);
    b *= min(1.0, 1.6 / max(length(b), 1e-4));
    e = mix(e, backdrop(b, rough, true), smoothstep(-0.02, -0.3, d.z));
  }
  return e;
}

struct Body { vec3 c; float R; vec3 s; vec3 ph; };

float sdBody(vec3 p, Body o) {
  vec3 q = p - o.c;
  vec3 r = o.R * o.s;
  float k0 = length(q / r);
  float k1 = length(q / (r * r));
  float d = k0 * (k0 - 1.0) / max(k1, 1e-6);
  // low-frequency wobble; surface tension lowers its amplitude and frequency
  float f = uShape.y * (1.0 - 0.45 * uShape.z);
  vec3 u = q / o.R * f;
  float w = sin(u.x + o.ph.x) * sin(u.y + o.ph.y) * sin(u.z + o.ph.z);
  return d - o.R * uShape.x * 0.07 * (1.0 - 0.6 * uShape.z) * w;
}

vec3 bodyNormal(vec3 p, Body o) {
  float e = 0.0015 * o.R;
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * sdBody(p + k.xyy * e, o) + k.yyx * sdBody(p + k.yyx * e, o) +
                   k.yxy * sdBody(p + k.yxy * e, o) + k.xxx * sdBody(p + k.xxx * e, o));
}

// Far intersection with the body's ellipsoid, from a point inside it.
float exitT(vec3 p, vec3 d, Body o) {
  vec3 S = o.R * o.s;
  vec3 q0 = (p - o.c) / S;
  vec3 qv = d / S;
  float a = dot(qv, qv), b = 2.0 * dot(q0, qv), c = dot(q0, q0) - 1.0;
  float disc = max(b * b - 4.0 * a * c, 0.0);
  return max((-b + sqrt(disc)) / (2.0 * a), 0.0);
}

// Liquid surface height in the unit sphere of the body (y up).
float liquidLevel(vec2 xz, float ang) {
  float base = uLiquid.x * 2.0 - 1.0 + uSlosh.y;
  float sway = uSlosh.w * 0.06;
  float h = base + (uSlosh.x + sway * sin(ang)) * xz.x + sway * 0.6 * cos(ang) * xz.y - 0.24 * xz.y;
  float rw2 = max(1.0 - base * base, 0.05);
  float rr = clamp(dot(xz, xz) / rw2, 0.0, 1.4);
  h += uLiquid.y * 0.2 * rr * rr * rr;           // meniscus climbs the wall
  float k = uLiquid.w;
  float amp = uLiquid.z * 0.045 * (0.45 + uSlosh.z);
  h += amp * (sin(k * xz.x + ang) * cos(k * 0.8 * xz.y - ang) + 0.5 * sin(k * 1.7 * (0.6 * xz.x + 0.8 * xz.y) + 2.0 * ang));
  return h;
}

// Transmitted rays see the scene, not the studio lights behind the camera.
vec3 behind(vec3 p, vec3 d, float rough) {
  return envLight(d, rough, p, false);
}

vec4 liquidOrb(vec2 uv, int i, inout vec3 glow) {
  vec4 A = uOrbA[i];
  vec4 B = uOrbB[i];
  float W = 2.0 * HALF;
  float ang = atan(uLoop.y, uLoop.x);

  Body o;
  o.R = A.z * W;
  vec2 drag = uDeform.zw;
  vec3 ds = vec3(1.0 + abs(drag.x) * 1.7, 1.0 + abs(drag.y) * 1.7, 1.0);
  ds /= pow(ds.x * ds.y * ds.z, 1.0 / 3.0);       // dragging conserves volume
  float br = uShape.w * 0.035 * sin(ang + B.x);
  o.s = vec3(uDeform.x * A.w, uDeform.y, 1.0) * ds * vec3(1.0 + br, 1.0 - br, 1.0);
  o.c = vec3(A.x * W + drag.x * o.R * 0.35, -A.y * W - drag.y * o.R * 0.35, 0.0);
  o.ph = vec3(ang + B.x, -ang + B.y, 2.0 * ang + B.x * 0.7);

  vec3 ro = vec3(0.0, 0.0, CAM_Z);
  vec3 rd = normalize(vec3(uv.x * W, -uv.y * W, -CAM_Z));
  float pixW = W / min(uRes.x, uRes.y);

  // bounding sphere
  float Rb = o.R * max(max(o.s.x, o.s.y), o.s.z) * (1.0 + uShape.x * 0.1) + pixW * 2.0;
  vec3 oc = ro - o.c;
  float bq = dot(oc, rd);
  float disc = bq * bq - (dot(oc, oc) - Rb * Rb);
  float glowR = o.R * (0.05 + uLightFx.z * 0.14);
  float glowA = uLightFx.z * 0.3;
  // one continuous, ellipse-aware distance for the halo, inside and outside the bounds
  vec3 closest = ro + rd * (-bq) - o.c;
  float miss = (length(closest / o.s) - o.R) * min(o.s.x, o.s.y);
  float halo = glowA * exp(-max(miss, 0.0) / glowR);
  if (disc < 0.0) {
    glow += RIM_COL * halo;
    return vec4(0.0);
  }
  float t = max(-bq - sqrt(disc), 0.0);
  float tEnd = -bq + sqrt(disc);
  float minD = 1e9, tMin = t;
  bool hit = false;
  for (int k = 0; k < 64; k++) {
    float d = sdBody(ro + rd * t, o);
    if (d < minD) { minD = d; tMin = t; }
    if (d < 0.0003 * o.R) { hit = true; break; }
    t += max(d * 0.9, 0.0006 * o.R);
    if (t > tEnd) break;
  }
  // analytic coverage across the silhouette keeps the edge smooth at any resolution
  float cover = hit ? 1.0 : clamp(1.0 - minD / (pixW * 1.2), 0.0, 1.0);
  glow += RIM_COL * halo * (1.0 - cover);
  if (cover <= 0.0) return vec4(0.0);

  vec3 p = ro + rd * (hit ? t : tMin);
  vec3 n = bodyNormal(p, o);
  if (uGlass2.w > 0.0) {
    vec3 np = (p - o.c) / o.R * 1.8 + vec3(B.xy * 0.1, 0.0);
    n = normalize(n + uGlass2.w * 0.22 * vec3(snoise(np + vec3(uLoop * 0.4, 0.0)), snoise(np + vec3(7.1, uLoop * 0.4)), 0.0));
  }
  vec3 V = -rd;
  float NdV = clamp(dot(n, V), 0.0, 1.0);
  float ior = uGlass.x;
  float rough = uGlass.y;
  float F0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  float F = clamp((F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0)) * uGlass.w, 0.0, 1.0);
  vec3 refl = envLight(reflect(rd, n), rough, p, true) * uLightFx.x;

  // --- into the body ---
  vec3 dir = refract(rd, n, 1.0 / ior);
  if (dot(dir, dir) == 0.0) dir = rd;
  vec3 start = p;
  float tExit = exitT(start, dir, o);
  float liquidLen = 0.0, glassLen = 0.0;
  vec3 meniscus = vec3(0.0);
  vec3 S = o.R * o.s;
  vec3 q0 = (p - o.c) / S;

  if (uLiquid.x > 0.003) {
    const int N = 24;
    float dt = tExit / float(N);
    float prev = q0.y - liquidLevel(q0.xz, ang);
    bool bent = false;
    for (int k = 1; k <= N; k++) {
      vec3 qq = (start + dir * dt * float(k) - o.c) / S;
      float side = qq.y - liquidLevel(qq.xz, ang);
      float seg = dt / o.R;
      if (side + prev < 0.0) liquidLen += seg; else glassLen += seg;
      if (side * prev < 0.0) {
        // the boundary: reflect a sliver of the environment, refract through it, then finish the path
        float fr = prev / (prev - side);
        vec3 pc = start + dir * dt * (float(k) - 1.0 + fr);
        vec3 qc = (pc - o.c) / S;
        float e = 0.01;
        float hx = (liquidLevel(qc.xz + vec2(e, 0.0), ang) - liquidLevel(qc.xz - vec2(e, 0.0), ang)) / (2.0 * e);
        float hz = (liquidLevel(qc.xz + vec2(0.0, e), ang) - liquidLevel(qc.xz - vec2(0.0, e), ang)) / (2.0 * e);
        vec3 nb = normalize(vec3(-hx / S.x, 1.0 / S.y, -hz / S.z));
        bool entering = prev > 0.0;
        vec3 nIn = entering ? nb : -nb;
        float c = abs(dot(dir, nb));
        float Fb = 0.03 + 0.97 * pow(1.0 - c, 5.0);
        meniscus = envLight(reflect(dir, nIn), rough * 0.6 + 0.05, pc, true) * Fb * 1.5;
        vec3 nd = refract(dir, nIn, entering ? 1.0 / 1.22 : 1.22);
        dir = dot(nd, nd) > 0.0 ? nd : reflect(dir, nIn);
        start = pc;
        tExit = exitT(start, dir, o);
        // the rest of the path stays on the far side of the boundary
        float rest = tExit / o.R;
        if (entering) liquidLen += rest; else glassLen += rest;
        bent = true;
        break;
      }
      prev = side;
    }
    if (!bent && tExit <= 0.0) glassLen += 0.0;
  } else {
    glassLen = tExit / o.R;
  }

  // --- out of the body, three wavelengths ---
  vec3 pe = start + dir * tExit;
  vec3 ne = bodyNormal(pe, o);
  float disp = uGlass2.x * 0.05;
  vec3 trans;
  for (int c = 0; c < 3; c++) {
    float iorC = ior * (1.0 + (float(c) - 1.0) * disp);
    vec3 dout = refract(dir, -ne, iorC);
    vec3 sc = dot(dout, dout) > 0.0 ? behind(pe, dout, rough) : envLight(reflect(dir, -ne), rough, pe, true) * 0.7;
    trans[c] = sc[c];
  }

  // Beer–Lambert absorption: the glass tints by thickness, the liquid by depth.
  vec3 sigG = (1.0 - GLASS_TINT) * uGlass2.y * 1.3 + uGlass2.y * 0.04;
  vec3 sigL = (1.0 - LIQUID_COL) * uLiquidAbsorb * 1.5 + uLiquidAbsorb * 0.1;
  vec3 T = exp(-(sigG * glassLen + sigL * liquidLen));

  // light scattered inside the liquid, with a slow internal circulation
  vec3 qm = q0 * 1.3;
  float circ = 0.5 + 0.5 * snoise(vec3(qm.x + uLoop.x * 0.45, qm.y + uLoop.y * 0.45, qm.z + B.x));
  vec3 Lw = normalize(vec3(uLight.x, -uLight.y, 0.8));
  vec3 ambient = envLight(vec3(0.0, 0.6, 0.8), 0.9, p, true) * 0.45 + 0.15;
  float lamL = 0.5 + 0.5 * dot(normalize(q0 + vec3(0.0, 0.4, 0.0)), Lw);
  vec3 inscatter = LIQUID_COL * (1.0 - exp(-liquidLen * uLiquidAbsorb * (0.5 + 0.5 * circ))) * (ambient * 0.7 + 0.9 * lamL) * 1.4;
  float liquidFrac = liquidLen / max(liquidLen + glassLen, 1e-3);

  // frosting: rough glass trades sharp transmission for a soft, lit body
  vec3 avg = envLight(dir, 1.0, pe, false);
  trans = mix(trans, avg, rough * 0.55);
  float lam = 0.5 + 0.5 * dot(n, Lw);
  vec3 milky = GLASS_TINT * (0.22 + 0.78 * lam) * (0.35 + 0.65 * luma(ambient));
  float frost = (1.0 - uGlass.z) * (1.0 - 0.75 * liquidFrac);
  vec3 body = mix(trans * T + inscatter + meniscus * mix(vec3(1.0), T, 0.5), milky, frost);

  vec3 col = mix(body, refl, F);

  // key-light specular (soft lobe) and a sharp clearcoat on top
  vec3 H = normalize(Lw + V);
  col += uLightFx2.x * 0.08 * pow(max(dot(n, H), 0.0), mix(60.0, 8.0, rough));
  float Fc = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
  col += uGlass2.z * Fc * envLight(reflect(rd, n), 0.015, p, true) * 0.5;

  // rim: back-lit fringe opposite the key light, and a thin illuminated edge
  float back = 0.55 + 0.45 * dot(normalize(n.xy + 1e-4), -normalize(Lw.xy + 1e-4));
  col += RIM_COL * uLightFx.y * pow(1.0 - NdV, 3.0) * back;
  col += mix(vec3(1.0), RIM_COL, 0.5) * uLightFx2.y * pow(1.0 - NdV, 14.0) * 1.6;

  glow += RIM_COL * uLightFx.z * 0.25 * pow(1.0 - NdV, 2.0) * cover;
  return vec4(col * cover, cover);
}

vec3 softClip(vec3 c) {
  vec3 k = max(c - 0.75, 0.0);
  return min(c, 0.75) + 0.25 * (1.0 - exp(-k / 0.25));
}

// Film grain (stronger in the midtones) and optional ordered-noise dithering.
vec3 post(vec3 col, vec2 cell) {
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float gn = hash(cell * 1.37 + 17.0 + uSeed) - 0.5;
  col += gn * uGrain * 0.55 * (0.35 + 0.65 * (1.0 - abs(lum * 2.0 - 1.0)));
  if (uDither > 0.001) {
    float levels = mix(48.0, 3.0, pow(uDither, 0.7));
    vec3 d = vec3(hash(cell + 3.1), hash(cell + 7.7), hash(cell + 11.3));
    col = floor(col * levels + d) / levels;
  }
  return clamp(col, 0.0, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float side = min(uRes.x, uRes.y);
  vec2 uv = (frag - 0.5 * uRes) / side;
  uv.y = -uv.y;

  // Pointer disturbance: a soft swirl that pushes the colour field, not the silhouette.
  vec2 dp = uv - uPtr.xy;
  float fall = exp(-dot(dp, dp) / 0.018);
  vec2 uvField = uv + (uPtrVel * 0.06 + vec2(-dp.y, dp.x) * 0.9) * fall * uPtr.z;

  vec2 cell = floor(frag / (uGrainScale * uPx));

  if (uMaterial == 1) {
    vec3 glow = vec3(0.0);
    vec4 lacc = vec4(0.0);
    for (int i = 0; i < MAX_ORBS; i++) {
      if (i >= uOrbCount) break;
      vec4 o = liquidOrb(uv, i, glow);
      lacc = o + lacc * (1.0 - o.a);
    }
    vec3 lin = lacc.rgb + backdrop(uv, 0.0, false) * (1.0 - lacc.a) * uBgAlpha + glow;
    float alpha = lacc.a + (1.0 - lacc.a) * uBgAlpha;
    if (uBgAlpha < 0.5) alpha = clamp(alpha + luma(glow), 0.0, 1.0);
    lin = softClip(lin * exp2(uLightFx.w));
    vec3 lcol = alpha > 0.0 ? post(linearToSrgb(lin / max(alpha, 1e-4)), cell) : vec3(0.0);
    outColor = vec4(lcol * alpha, alpha);
    return;
  }
  float grainN = hash(cell + uSeed * 0.731);

  vec4 acc = vec4(0.0);
  for (int i = 0; i < MAX_ORBS; i++) {
    if (i >= uOrbCount) break;
    vec4 o = orb(uv, uvField, i, grainN);
    acc = o + acc * (1.0 - o.a);
  }

  vec3 col = acc.a > 0.0 ? acc.rgb / acc.a : vec3(0.0);
  col = post(linearToSrgb(col), cell);

  float a = acc.a;
  vec3 pre = col * a;
  outColor = vec4(pre + uBg * (1.0 - a) * uBgAlpha, a + (1.0 - a) * uBgAlpha);
}
`;
