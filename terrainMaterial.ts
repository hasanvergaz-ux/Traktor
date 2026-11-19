// Terrain: one PBR material that blends photo-scanned ground layers per pixel.
// Layer order in the texture arrays:
//   0 grass A, 1 grass B, 2 stubble, 3 cultivated soil, 4 asphalt, 5 dry dirt, 6 wet mud, 7 concrete
import * as THREE from "three";
import { FIELDS, MAP_SIZE, PITS, ROAD_SEGS, TRACK_SEGS, YARD } from "../sim/world";

export const TERRAIN_DIFF = [
  "t_sparse_grass_diff.jpg", "t_grass_ground_diff.jpg", "t_withered_grass_diff.jpg", "t_farm_soil_diff.jpg",
  "t_asphalt_02_diff.jpg", "t_brown_mud_dry_diff.jpg", "t_brown_mud_02_diff.jpg", "o_concrete_floor_02_diff.jpg",
];
export const TERRAIN_NOR = TERRAIN_DIFF.map((n) => n.replace("_diff", "_nor"));

export function makeTerrainMaterial(diff: THREE.Texture, nor: THREE.Texture, maskTex: THREE.Texture) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const uniforms = {
    uDiff: { value: diff },
    uNor: { value: nor },
    uMask: { value: maskTex },
    uRoad: { value: ROAD_SEGS.map((s) => new THREE.Vector4(s.ax, s.az, s.bx, s.bz)) },
    uRoadCum: { value: ROAD_SEGS.map((s) => s.cum) },
    uTrack: { value: TRACK_SEGS.map((s) => new THREE.Vector4(s.ax, s.az, s.bx, s.bz)) },
    uField: { value: FIELDS.map((f) => new THREE.Vector4(f.x0, f.z0, f.x1, f.z1)) },
    uFieldKind: { value: FIELDS.map((f) => f.kind) },
    uPit: { value: PITS.map((p) => new THREE.Vector4(p.x, p.z, p.r, p.mud ? 1 : 0)) },
    uYard: { value: new THREE.Vector4(YARD.x0, YARD.z0, YARD.x1, YARD.z1) },
    uMapSize: { value: MAP_SIZE },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNor = normalize(mat3(modelMatrix) * objectNormal);",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
#define RN ${ROAD_SEGS.length}
#define TN ${TRACK_SEGS.length}
#define FN ${FIELDS.length}
#define PN ${PITS.length}
uniform sampler2DArray uDiff;
uniform sampler2DArray uNor;
uniform sampler2D uMask;
uniform vec4 uRoad[RN];
uniform float uRoadCum[RN];
uniform vec4 uTrack[TN];
uniform vec4 uField[FN];
uniform float uFieldKind[FN];
uniform vec4 uPit[PN];
uniform vec4 uYard;
uniform float uMapSize;
varying vec3 vWPos;
varying vec3 vWNor;
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1, 0)), u.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), u.x), u.y);
}
float segD(vec2 p, vec4 s, out float t) {
  vec2 ab = s.zw - s.xy;
  t = clamp(dot(p - s.xy, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  return length(p - s.xy - ab * t);
}
// two rotated scales hide the tiling repeat
vec3 sD(float layer, vec2 uv, float k) {
  vec3 a = texture(uDiff, vec3(uv, layer)).rgb;
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.41 + 0.37;
  vec3 b = texture(uDiff, vec3(uv2, layer)).rgb;
  return mix(a, b, k);
}
vec3 sN(float layer, vec2 uv) {
  vec3 n = texture(uNor, vec3(uv, layer)).xyz * 2.0 - 1.0;
  n.y = -n.y;
  return n;
}
`,
      )
      .replace(
        "#include <map_fragment>",
        `
vec2 P = vWPos.xz;
float kAT = 0.25 + 0.5 * smoothstep(0.2, 0.8, tNoise(P * 0.045));
float macro = tNoise(P * 0.011) * 0.6 + tNoise(P * 0.047) * 0.4;
vec3 tC; vec3 tN; float tR;
{
  float g2 = smoothstep(0.3, 0.7, tNoise(P * 0.017 + 4.0));
  vec2 uv = P / 3.2;
  tC = sD(0.0, uv, kAT); tN = sN(0.0, uv);
  if (g2 > 0.01) { vec2 uvb = P / 3.8; tC = mix(tC, sD(1.0, uvb, kAT), g2); tN = mix(tN, sN(1.0, uvb), g2); }
  // lift the scanned meadow toward a fresh spring green, varied by large-scale noise
  tC *= mix(vec3(0.72, 1.0, 0.5), vec3(0.85, 1.0, 0.62), macro) * (0.8 + 0.4 * macro) * 1.1;
  tR = 0.96;
}
#define BLEND(W, LAYER, SCALE, ROUGH, TINT) if ((W) > 0.003) { vec2 uv_ = P / (SCALE); vec3 c_ = sD(LAYER, uv_, kAT) * (TINT); vec3 n_ = sN(LAYER, uv_); tC = mix(tC, c_, (W)); tN = mix(tN, n_, (W)); tR = mix(tR, ROUGH, (W)); }
// fields
float wStub = 0.0; float wSoil = 0.0;
for (int i = 0; i < FN; i++) {
  vec4 f = uField[i];
  vec2 dd = max(f.xy - P, P - f.zw);
  float e = max(dd.x, dd.y) + (tNoise(P * 0.4) - 0.5) * 1.2;
  float w = 1.0 - smoothstep(-1.5, 0.6, e);
  if (uFieldKind[i] < 0.5) wStub = max(wStub, w); else wSoil = max(wSoil, w);
}
BLEND(wStub, 2.0, 3.0, 0.95, vec3(0.95 + 0.1 * macro))
BLEND(wSoil, 3.0, 2.8, 0.92, vec3(0.85))
// farm tracks: two dirt ruts with grass in the middle
float td = 1e5; float tt;
for (int i = 0; i < TN; i++) td = min(td, segD(P, uTrack[i], tt));
float inT = 1.0 - smoothstep(1.45, 2.3, td + (tNoise(P * 0.7) - 0.5) * 0.6);
float mid = 1.0 - smoothstep(0.22, 0.6, td + (tNoise(P * 1.3) - 0.5) * 0.3);
float wDirt = inT * (1.0 - mid * 0.85);
// pits: bare dirt on the slopes, wet mud at the bottom
float wMud = 0.0;
for (int i = 0; i < PN; i++) {
  vec4 p = uPit[i];
  float q = length(P - p.xy) / p.z + (tNoise(P * 0.5 + float(i)) - 0.5) * 0.25;
  wDirt = max(wDirt, (1.0 - smoothstep(0.65, 1.05, q)) * 0.9);
  if (p.w > 0.5) wMud = max(wMud, 1.0 - smoothstep(0.28, 0.55, q));
}
BLEND(wDirt, 5.0, 3.4, 0.95, vec3(1.0))
BLEND(wMud, 6.0, 2.6, 0.38, vec3(0.7))
// cultivated soil and tyre tracks from the live mask
vec4 m = texture(uMask, P / uMapSize + 0.5);
float wTill = smoothstep(0.25, 0.75, m.r);
BLEND(wTill, 3.0, 2.4, 0.97, vec3(0.72, 0.66, 0.62) * (0.9 + 0.2 * tNoise(P * 2.0)))
tC *= 1.0 - 0.34 * m.g;
tR = mix(tR, 0.7, m.g * 0.6);
// farm yard concrete
{
  vec2 dd = max(uYard.xy - P, P - uYard.zw);
  float wY = 1.0 - smoothstep(-0.25, 0.25, max(dd.x, dd.y));
  BLEND(wY, 7.0, 4.0, 0.85, vec3(0.95))
}
// main road: asphalt, gravel shoulders, painted lines
float rd = 1e5; float rs = 0.0;
for (int i = 0; i < RN; i++) {
  float t; float d = segD(P, uRoad[i], t);
  if (d < rd) { rd = d; vec4 s = uRoad[i]; rs = uRoadCum[i] + t * length(s.zw - s.xy); }
}
float wSh = 1.0 - smoothstep(4.1, 5.3, rd + (tNoise(P * 0.8) - 0.5) * 0.7);
BLEND(wSh * 0.9, 5.0, 2.4, 0.95, vec3(1.15, 1.1, 1.05))
float wA = 1.0 - smoothstep(3.42, 3.6, rd);
BLEND(wA, 4.0, 5.0, 0.82, vec3(0.92))
float edgeL = 1.0 - smoothstep(0.06, 0.09, abs(rd - 3.15));
float centerL = (1.0 - smoothstep(0.06, 0.09, rd)) * step(fract(rs / 9.0), 0.5);
float paint = max(edgeL, centerL) * wA * (0.6 + 0.4 * tNoise(P * 3.0));
tC = mix(tC, vec3(0.78, 0.78, 0.74), paint);
tR = mix(tR, 0.6, paint);
diffuseColor.rgb *= tC;
`,
      )
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = tR;")
      .replace(
        "#include <normal_fragment_maps>",
        `{
  vec3 Nw = normalize(vWNor);
  vec3 Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x);
  vec3 Bw = normalize(cross(Tw, Nw));
  vec3 tn = normalize(vec3(tN.xy * 1.15, max(tN.z, 0.25)));
  vec3 nW = normalize(Tw * tn.x + Bw * tn.y + Nw * tn.z);
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`,
      );
  };
  mat.customProgramCacheKey = () => "terrain-v1";
  return mat;
}
