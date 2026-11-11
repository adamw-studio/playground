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
  float grainN = hash(cell + uSeed * 0.731);

  vec4 acc = vec4(0.0);
  for (int i = 0; i < MAX_ORBS; i++) {
    if (i >= uOrbCount) break;
    vec4 o = orb(uv, uvField, i, grainN);
    acc = o + acc * (1.0 - o.a);
  }

  vec3 col = acc.a > 0.0 ? acc.rgb / acc.a : vec3(0.0);
  col = linearToSrgb(col);

  // Film grain, stronger in the midtones.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float gn = hash(cell * 1.37 + 17.0 + uSeed) - 0.5;
  col += gn * uGrain * 0.55 * (0.35 + 0.65 * (1.0 - abs(lum * 2.0 - 1.0)));

  // Ordered-noise dithering into a reduced number of levels.
  if (uDither > 0.001) {
    float levels = mix(48.0, 3.0, pow(uDither, 0.7));
    vec3 d = vec3(hash(cell + 3.1), hash(cell + 7.7), hash(cell + 11.3));
    col = floor(col * levels + d) / levels;
  }
  col = clamp(col, 0.0, 1.0);

  float a = acc.a;
  vec3 pre = col * a;
  outColor = vec4(pre + uBg * (1.0 - a) * uBgAlpha, a + (1.0 - a) * uBgAlpha);
}
`;
