// World layout and terrain: the single source of truth for heights, surfaces,
// buildings and colliders. Both the scene (drawing) and the sim (physics) read it.
import { clamp, fbm, mulberry32, smoothstep } from "./math";

export const MAP_SIZE = 600; // inner, fully detailed terrain (meters)
export const MAP_LIMIT = 285; // where the tractor may drive

export type Seg = { ax: number; az: number; bx: number; bz: number; len: number; cum: number };
type Pt = readonly [number, number];

function polyToSegs(pts: readonly Pt[]): Seg[] {
  const out: Seg[] = [];
  let cum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    out.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], len, cum });
    cum += len;
  }
  return out;
}

export type Nearest = { d: number; cx: number; cz: number; s: number };
export function nearestOn(segs: readonly Seg[], x: number, z: number, out: Nearest): Nearest {
  out.d = 1e9;
  for (const g of segs) {
    const vx = g.bx - g.ax;
    const vz = g.bz - g.az;
    const t = clamp(((x - g.ax) * vx + (z - g.az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
    const cx = g.ax + vx * t;
    const cz = g.az + vz * t;
    const d = Math.hypot(x - cx, z - cz);
    if (d < out.d) {
      out.d = d;
      out.cx = cx;
      out.cz = cz;
      out.s = g.cum + g.len * t;
    }
  }
  return out;
}

// ---------- roads & tracks ----------
export const ROAD_PTS: Pt[] = [
  [-330, -36], [-190, -30], [-100, -12], [-40, -4], [0, 0], [50, 6], [110, -8], [190, -40], [330, -64],
];
export const ROAD_SEGS = polyToSegs(ROAD_PTS);
export const ROAD_HALF = 3.5;

export const TRACKS: Pt[][] = [
  [[-72, 12], [-72, -9]], // yard to main road
  [[-62, 46], [-62, 64], [-45, 68], [55, 68], [66, 44], [70, 7]], // yard -> wheat field -> road
  [[-62, 64], [-96, 64], [-98, 52]], // to the west stubble field
  [[120, -10], [122, -62], [118, -70]], // road -> north-east field
];
export const TRACK_SEGS = TRACKS.flatMap((t) => polyToSegs(t));
export const TRACK_HALF = 2.0;

export function roadZ(x: number) {
  for (let i = 0; i < ROAD_PTS.length - 1; i++) {
    const a = ROAD_PTS[i]!;
    const b = ROAD_PTS[i + 1]!;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return ROAD_PTS[ROAD_PTS.length - 1]![1];
}

// ---------- fields, pits, yard ----------
export type Field = { x0: number; z0: number; x1: number; z1: number; kind: 0 | 1; name: string };
export const FIELDS: Field[] = [
  { x0: -172, z0: 48, x1: -102, z1: 140, kind: 0, name: "Batı anızı" },
  { x0: -40, z0: 76, x1: 52, z1: 156, kind: 1, name: "Buğday tarlası" },
  { x0: 70, z0: -150, x1: 172, z1: -74, kind: 0, name: "Kuzey anızı" },
];

export type Pit = { x: number; z: number; r: number; depth: number; mud: boolean };
export const PITS: Pit[] = [
  { x: -82, z: 82, r: 9, depth: 1.5, mud: true },
  { x: -132, z: 100, r: 8, depth: 1.2, mud: true },
  { x: 96, z: 86, r: 13, depth: 2.2, mud: true },
  { x: 152, z: -30, r: 10, depth: 1.7, mud: false },
  { x: -50, z: 68, r: 2.2, depth: 0.32, mud: true },
  { x: 8, z: 68.4, r: 2.6, depth: 0.38, mud: true },
  { x: 38, z: 67.6, r: 2.0, depth: 0.3, mud: true },
  { x: 121, z: -38, r: 2.4, depth: 0.34, mud: true },
];

export const YARD = { x0: -96, z0: 10, x1: -54, z1: 48 };

// ---------- buildings ----------
export type House = { x: number; z: number; w: number; d: number; floors: number; tint: number; rot: number; wall: boolean };
export type Box = { x: number; z: number; w: number; d: number; rot: number };

const rng = mulberry32(1907);
export const HOUSES: House[] = [];
{
  const xs = [-46, -33, -20, -6, 8, 22, 36, 50, 64, -40, -12, 30, 56];
  xs.forEach((x, i) => {
    const second = i >= 9;
    let side = i % 2 === 0 ? 1 : -1;
    if (second) side = i % 2 === 0 ? -1 : 1;
    if (side < 0 && Math.abs(x - 14) < 13) side = 1; // keep the mosque plot free
    const off = second ? 33 + rng() * 4 : 15.5 + rng() * 3;
    const w = 7.5 + rng() * 3;
    const d = 6.5 + rng() * 2.5;
    HOUSES.push({
      x,
      z: roadZ(x) + side * off,
      w,
      d,
      floors: rng() < 0.45 ? 2 : 1,
      tint: Math.floor(rng() * 5),
      rot: side > 0 ? Math.PI : 0,
      wall: rng() < 0.6,
    });
  });
}
export const BARN: Box = { x: -87, z: 32, w: 13, d: 19, rot: 0 };
export const SHED: Box = { x: -64, z: 42.5, w: 13, d: 7, rot: 0 };
export const SILOS = [
  { x: -102, z: 16, r: 2.6, h: 10 },
  { x: -102, z: 23, r: 2.6, h: 10 },
];
export const MOSQUE: Box = { x: 14, z: -31, w: 11, d: 11, rot: 0.2 };

export type Bale = { x: number; z: number; rot: number; stack: number };
export const BALES: Bale[] = [
  { x: -78, z: 13, rot: 0, stack: 0 }, { x: -76.3, z: 13, rot: 0, stack: 0 }, { x: -77.15, z: 13, rot: 0, stack: 1 },
  { x: -96, z: 44, rot: 1.57, stack: 0 }, { x: -96, z: 42.4, rot: 1.57, stack: 0 },
  { x: -104, z: 58, rot: 0.4, stack: 0 }, { x: -110, z: 46, rot: 1.2, stack: 0 }, { x: -170, z: 44, rot: 2.2, stack: 0 },
  { x: 76, z: -70, rot: 0.3, stack: 0 }, { x: 82, z: -71, rot: 1.9, stack: 0 }, { x: 168, z: -72, rot: 0.8, stack: 0 },
];

export type Fence = { ax: number; az: number; bx: number; bz: number };
export const FENCES: Fence[] = [
  { ax: -96, az: 50, bx: -54, bz: 50 },
  { ax: -54, az: 50, bx: -54, bz: 47 },
  { ax: -108, az: 8, bx: -108, bz: 50 },
  { ax: -108, az: 50, bx: -96, bz: 50 },
];

export const POLES: Pt[] = [];
for (let x = -210; x <= 230; x += 40) {
  if (Math.abs(x - 14) < 8) continue;
  POLES.push([x, roadZ(x) - 10.5]);
}

// ---------- trees ----------
export type TreeKind = "walnut" | "oak" | "poplar" | "fruit" | "forest";
export type Tree = { kind: TreeKind; x: number; z: number; s: number; rot: number };
export const TREES: Tree[] = [];

// Pads: flattened ground under buildings (center, half sizes, rotation).
export type Pad = { x: number; z: number; hx: number; hz: number; rot: number };
export const PADS: Pad[] = [
  ...HOUSES.map((h) => ({ x: h.x, z: h.z, hx: h.w / 2 + 3, hz: h.d / 2 + 3, rot: h.rot })),
  { x: BARN.x, z: BARN.z, hx: BARN.w / 2 + 2, hz: BARN.d / 2 + 2, rot: 0 },
  { x: MOSQUE.x, z: MOSQUE.z, hx: 9, hz: 9, rot: MOSQUE.rot },
  { x: -102, z: 19.5, hx: 4.5, hz: 8, rot: 0 },
  { x: (YARD.x0 + YARD.x1) / 2, z: (YARD.z0 + YARD.z1) / 2, hx: (YARD.x1 - YARD.x0) / 2, hz: (YARD.z1 - YARD.z0) / 2, rot: 0 },
];

// ---------- height ----------
const tmpN: Nearest = { d: 0, cx: 0, cz: 0, s: 0 };
export function baseHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  const A = 0.7 + 3.4 * smoothstep(70, 210, r) + 16 * smoothstep(230, 340, r);
  return (
    A * fbm(x * 0.0065 + 3.1, z * 0.0065 - 1.7, 4) +
    0.7 * smoothstep(40, 140, r) * fbm(x * 0.03, z * 0.03, 3) +
    16 * smoothstep(250, 360, r) +
    30 * smoothstep(420, 900, r) * (0.6 + 0.4 * fbm(x * 0.004, z * 0.004, 3))
  );
}

function padWeight(p: Pad, x: number, z: number) {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const dx = x - p.x;
  const dz = z - p.z;
  const lx = Math.abs(dx * c - dz * s) - p.hx;
  const lz = Math.abs(dx * s + dz * c) - p.hz;
  const e = Math.max(lx, lz);
  return 1 - smoothstep(0, 8, e);
}

export function heightAt(x: number, z: number) {
  let h = baseHeight(x, z);
  // flatten across the main road and the farm tracks, following them along their length
  nearestOn(ROAD_SEGS, x, z, tmpN);
  const rd = tmpN.d;
  const fr = 1 - smoothstep(ROAD_HALF + 1.5, ROAD_HALF + 10, rd);
  if (fr > 0) h += (baseHeight(tmpN.cx, tmpN.cz) * 0.9 + 0.12 - h) * fr;
  nearestOn(TRACK_SEGS, x, z, tmpN);
  const ft = 1 - smoothstep(TRACK_HALF + 0.5, TRACK_HALF + 6, tmpN.d);
  if (ft > 0) h += (baseHeight(tmpN.cx, tmpN.cz) - h) * ft * 0.85;
  for (const p of PADS) {
    const w = padWeight(p, x, z);
    if (w > 0) h += (baseHeight(p.x, p.z) - h) * w;
  }
  // roadside drainage ditches outside the village
  const ditch = smoothstep(85, 115, Math.abs(x)) * Math.exp(-(((rd - 9) / 2.4) ** 2));
  h -= 0.9 * ditch;
  // pits
  for (const p of PITS) {
    const q = Math.hypot(x - p.x, z - p.z) / p.r;
    if (q < 1) {
      const b = 1 - q * q;
      h -= p.depth * b * b;
    }
  }
  return h;
}

// ---------- surfaces ----------
export const SURF = {
  grass: 0,
  stubble: 1,
  wheat: 2,
  tilled: 3,
  dirt: 4,
  mud: 5,
  asphalt: 6,
  concrete: 7,
  gravel: 8,
} as const;
export type Surface = (typeof SURF)[keyof typeof SURF];
export const SURF_NAMES = ["Çimen", "Anız", "Buğday", "Sürülmüş toprak", "Toprak yol", "Çamur", "Asfalt", "Beton", "Mıcır"];
/** rolling resistance (fraction of g) and traction coefficient per surface */
export const SURF_CRR = [0.05, 0.05, 0.07, 0.09, 0.035, 0.12, 0.015, 0.015, 0.03];
export const SURF_MU = [0.68, 0.7, 0.62, 0.58, 0.72, 0.48, 0.92, 0.9, 0.75];

export const inRect = (x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }) =>
  x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

/** Static surface ignoring the tillage mask. */
export function baseSurfaceAt(x: number, z: number): Surface {
  nearestOn(ROAD_SEGS, x, z, tmpN);
  if (tmpN.d < ROAD_HALF) return SURF.asphalt;
  if (tmpN.d < ROAD_HALF + 1.2) return SURF.gravel;
  if (inRect(x, z, YARD)) return SURF.concrete;
  for (const p of PITS) {
    const q = Math.hypot(x - p.x, z - p.z) / p.r;
    if (q < 0.5 && p.mud) return SURF.mud;
    if (q < 0.9) return SURF.dirt;
  }
  nearestOn(TRACK_SEGS, x, z, tmpN);
  if (tmpN.d < TRACK_HALF && tmpN.d > 0.45) return SURF.dirt;
  for (const f of FIELDS) if (inRect(x, z, f)) return f.kind === 1 ? SURF.wheat : SURF.stubble;
  return SURF.grass;
}

// ---------- colliders ----------
export type Collider =
  | { k: "c"; x: number; z: number; r: number }
  | { k: "b"; x: number; z: number; hx: number; hz: number; c: number; s: number };

export const COLLIDERS: Collider[] = [];
const box = (x: number, z: number, w: number, d: number, rot: number) =>
  COLLIDERS.push({ k: "b", x, z, hx: w / 2, hz: d / 2, c: Math.cos(rot), s: Math.sin(rot) });
for (const h of HOUSES) box(h.x, h.z, h.w + 0.4, h.d + 0.4, h.rot);
box(BARN.x, BARN.z, BARN.w, BARN.d, BARN.rot);
box(SHED.x, SHED.z + 2.6, SHED.w, 1.0, 0); // back wall only; the shed front is open
for (const sx of [-1, 1]) COLLIDERS.push({ k: "c", x: SHED.x + sx * 6.2, z: SHED.z - 3.2, r: 0.25 });
box(MOSQUE.x, MOSQUE.z, MOSQUE.w, MOSQUE.d, MOSQUE.rot);
COLLIDERS.push({ k: "c", x: MOSQUE.x + 6.6, z: MOSQUE.z + 5.0, r: 1.0 });
for (const s of SILOS) COLLIDERS.push({ k: "c", x: s.x, z: s.z, r: s.r });
for (const b of BALES) if (b.stack === 0) COLLIDERS.push({ k: "c", x: b.x, z: b.z, r: 0.85 });
for (const p of POLES) COLLIDERS.push({ k: "c", x: p[0], z: p[1], r: 0.2 });
for (const f of FENCES) {
  const L = Math.hypot(f.bx - f.ax, f.bz - f.az);
  box((f.ax + f.bx) / 2, (f.az + f.bz) / 2, 0.2, L, Math.atan2(f.bx - f.ax, f.bz - f.az));
}
// low stone garden walls around some houses (three sides, the road side stays open)
export type Wall = { x: number; z: number; w: number; d: number; rot: number };
export const WALLS: Wall[] = [];
for (const h of HOUSES) {
  if (!h.wall) continue;
  const W = h.w + 6;
  const D = h.d + 7;
  const c = Math.cos(h.rot);
  const s = Math.sin(h.rot);
  // local -> world (rotation about Y)
  const at = (lx: number, lz: number) => [h.x + lx * c + lz * s, h.z - lx * s + lz * c] as const;
  const segs: [number, number, number, number][] = [
    [-W / 2, -D / 2 + 1.5, W, 0.45], // back
    [-W / 2, 0, 0.45, D], // left
    [W / 2, 0, 0.45, D], // right
  ];
  for (const [lx, lz, w, d] of segs) {
    const cx = lx === -W / 2 && w === W ? 0 : lx;
    const cz = w === W ? lz : 1.5;
    const [wx, wz] = at(cx, cz);
    WALLS.push({ x: wx, z: wz, w, d, rot: h.rot });
    box(wx, wz, w, d, h.rot);
  }
}

// ---------- tree placement (seeded) ----------
function freeSpot(x: number, z: number, pad: number) {
  if (Math.abs(x) > 296 || Math.abs(z) > 296) return Math.hypot(x, z) > 300;
  nearestOn(ROAD_SEGS, x, z, tmpN);
  if (tmpN.d < ROAD_HALF + 4 + pad) return false;
  nearestOn(TRACK_SEGS, x, z, tmpN);
  if (tmpN.d < TRACK_HALF + 2 + pad) return false;
  if (inRect(x, z, { x0: YARD.x0 - 6, z0: YARD.z0 - 6, x1: YARD.x1 + 6, z1: YARD.z1 + 6 })) return false;
  for (const f of FIELDS) if (inRect(x, z, { x0: f.x0 - 3, z0: f.z0 - 3, x1: f.x1 + 3, z1: f.z1 + 3 })) return false;
  for (const p of PITS) if (Math.hypot(x - p.x, z - p.z) < p.r + 2) return false;
  for (const c of COLLIDERS) {
    if (c.k === "c" && Math.hypot(x - c.x, z - c.z) < c.r + 2 + pad) return false;
    if (c.k === "b" && Math.hypot(x - c.x, z - c.z) < Math.max(c.hx, c.hz) + 2 + pad) return false;
  }
  for (const t of TREES) if (Math.hypot(x - t.x, z - t.z) < 3.5 + pad) return false;
  return true;
}
{
  const r = mulberry32(42);
  const add = (kind: TreeKind, x: number, z: number, s: number) => TREES.push({ kind, x, z, s, rot: r() * Math.PI * 2 });
  // poplar rows along the farm track and the east road
  for (let x = -40; x <= 50; x += 7) if (freeSpot(x, 63, -1.5)) add("poplar", x + r() * 1.5, 63 + r(), 0.85 + r() * 0.3);
  for (let x = 80; x <= 200; x += 9) {
    const z = roadZ(x) - 13;
    if (freeSpot(x, z, -1)) add("poplar", x, z, 0.85 + r() * 0.35);
  }
  // orchard
  for (let x = 84; x <= 132; x += 6) for (let z = 20; z <= 50; z += 6) add("fruit", x + r() * 0.8, z + r() * 0.8, 0.85 + r() * 0.3);
  // yard trees behind houses
  for (const h of HOUSES) {
    if (r() < 0.7) {
      const back = h.rot === 0 ? -1 : 1;
      const x = h.x + (r() - 0.5) * h.w;
      const z = h.z + back * (h.d / 2 + 5 + r() * 3);
      if (freeSpot(x, z, -2.5)) add(r() < 0.5 ? "walnut" : "fruit", x, z, 0.8 + r() * 0.3);
    }
  }
  // meadow trees
  for (let k = 0; k < 2500 && TREES.length < 230; k++) {
    const x = (r() - 0.5) * 540;
    const z = (r() - 0.5) * 540;
    const rr = Math.hypot(x, z);
    if (rr < 60 && r() < 0.7) continue;
    if (freeSpot(x, z, 1.5)) add(r() < 0.55 ? "walnut" : "oak", x, z, 0.8 + r() * 0.45);
  }
  // forest belt on the hills around the map
  for (let k = 0; k < 9000 && TREES.length < 900; k++) {
    const a = r() * Math.PI * 2;
    const d = 250 + r() * 420;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const clump = fbm(x * 0.012, z * 0.012, 2);
    if (clump < -0.05) continue;
    if (d < 300 && !freeSpot(x, z, 0)) continue;
    add("forest", x, z, 0.9 + r() * 0.5);
  }
}
for (const t of TREES) {
  if (t.kind === "forest" && Math.hypot(t.x, t.z) > 300) continue;
  COLLIDERS.push({ k: "c", x: t.x, z: t.z, r: t.kind === "poplar" ? 0.35 : t.kind === "fruit" ? 0.25 : 0.45 });
}

// ---------- start positions ----------
export const START = { x: -70, z: 22, yaw: Math.PI };
/** The cultivator starts parked a few meters behind the tractor. */
export const IMPLEMENT_START = { x: -70, z: 28.0, yaw: Math.PI };

/** Whether soil at (x,z) can be cultivated: not on asphalt, concrete or inside buildings. */
export function isTillable(x: number, z: number) {
  if (Math.abs(x) > MAP_LIMIT + 10 || Math.abs(z) > MAP_LIMIT + 10) return false;
  nearestOn(ROAD_SEGS, x, z, tmpN);
  if (tmpN.d < ROAD_HALF + 0.4) return false;
  if (inRect(x, z, YARD)) return false;
  for (const c of COLLIDERS) {
    if (c.k !== "b") continue;
    const dx = x - c.x;
    const dz = z - c.z;
    if (Math.abs(dx * c.c - dz * c.s) < c.hx && Math.abs(dx * c.s + dz * c.c) < c.hz) return false;
  }
  return true;
}
