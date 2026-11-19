// Tractor + rear implement simulation. Pure TypeScript: no React, no three.js.
// Conventions: world X east, Z south, Y up. yaw 0 faces +Z; forward = (sin yaw, cos yaw).
// Tractor-local +X is the tractor's LEFT side (matches the 3D model).
import { FieldMask } from "./field";
import { HITCH, IMPL, hitchPoint } from "./hitch";
import { clamp, damp, lerp, wrapAngle } from "./math";
import {
  COLLIDERS,
  IMPLEMENT_START,
  MAP_LIMIT,
  START,
  SURF,
  SURF_CRR,
  SURF_MU,
  baseSurfaceAt,
  heightAt,
  isTillable,
  type Surface,
} from "./world";

export const TR = {
  WHEELBASE: 2.4,
  REAR_Z: -1.44,
  FRONT_Z: 0.96,
  HALF_TRACK: 0.9,
  REAR_R: 0.86,
  FRONT_R: 0.6,
  G: 9.81,
  /** peak tractive acceleration in low gear (m/s²) */
  DRIVE: 4.4,
  VMAX_F: 8.9, // 32 km/h
  VMAX_R: 4.2, // 15 km/h
  BRAKE: 7.5,
  ENGINE_BRAKE: 0.8,
  STEER_MAX: 0.62,
  STEER_RATE: 2.6,
  SUSP_K: 180,
  SUSP_C: 17,
  ANG_K: 120,
  ANG_C: 15,
  /** extra resistance of a fully sunk cultivator (m/s²) */
  DRAFT: 1.7,
  ATTACH_DIST: 1.3,
  ATTACH_YAW: 0.5,
  IDLE_RPM: 850,
  MAX_RPM: 2300,
  CRANK_TIME: 2.1,
  BODY_CIRCLES: [1.75, 0.35, -1.35],
  BODY_R: 1.12,
};

export type Tractor = {
  x: number; z: number; y: number; vy: number; yaw: number; v: number;
  pitch: number; roll: number; vp: number; vr: number;
  steer: number; gas: number; brake: number; dir: 1 | -1;
  wheelDist: number; rpm: number; load: number; slip: number;
  lift: number; liftMoving: boolean; liftCmd: number;
  engine: boolean; running: boolean; crankEnd: number; t: number;
  grounded: boolean; surface: Surface; accel: number; yawRate: number;
  trackAcc: number;
};

export type Pose = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number };

export type Implement = Pose & {
  attached: boolean; vy: number; blend: number; from: Pose;
  working: boolean; depth: number; draft: number;
  px: number; pz: number; hasPrev: boolean; rollerA: number;
};

export type SimInput = {
  throttle: number; brake: number; steer: number; dir: 1 | -1;
  liftCmd: number; engineOn: boolean; attachPressed: boolean;
};

export type SimEvent =
  | { type: "crank" | "stall" | "attach" | "detach" | "attachFail" | "noHydraulics" }
  | { type: "bump" | "land" | "thud"; strength: number };

export type Sim = {
  tr: Tractor; imp: Implement; mask: FieldMask;
  tilledM2: number; canAttach: boolean; attachDist: number; events: SimEvent[];
};

const pose = (): Pose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 });

export function createSim(mask = new FieldMask()): Sim {
  const sim: Sim = {
    tr: {
      x: 0, z: 0, y: 0, vy: 0, yaw: 0, v: 0, pitch: 0, roll: 0, vp: 0, vr: 0,
      steer: 0, gas: 0, brake: 0, dir: 1, wheelDist: 0, rpm: 0, load: 0, slip: 0,
      lift: 1, liftMoving: false, liftCmd: 0, engine: false, running: false, crankEnd: 0, t: 0,
      grounded: true, surface: SURF.concrete, accel: 0, yawRate: 0, trackAcc: 0,
    },
    imp: {
      ...pose(), attached: false, vy: 0, blend: 1, from: pose(), working: false, depth: 0, draft: 0,
      px: 0, pz: 0, hasPrev: false, rollerA: 0,
    },
    mask, tilledM2: 0, canAttach: false, attachDist: 99, events: [],
  };
  resetSim(sim);
  return sim;
}

export function resetSim(sim: Sim) {
  const { tr, imp } = sim;
  Object.assign(tr, { x: START.x, z: START.z, yaw: START.yaw, v: 0, vy: 0, vp: 0, vr: 0, steer: 0, lift: 1 });
  tr.y = heightAt(tr.x, tr.z);
  tr.pitch = 0;
  tr.roll = 0;
  Object.assign(imp, { x: IMPLEMENT_START.x, z: IMPLEMENT_START.z, yaw: IMPLEMENT_START.yaw, attached: false, vy: 0, blend: 1 });
  imp.y = heightAt(imp.x, imp.z) + IMPL.restY;
  imp.hasPrev = false;
}

/** Tractor-local point -> world, using the model's YXZ euler (yaw, -pitch, roll). */
export function toWorld(p: Pose, lx: number, ly: number, lz: number, out: { x: number; y: number; z: number }) {
  const cb = Math.cos(p.roll);
  const sb = Math.sin(p.roll);
  const ca = Math.cos(-p.pitch);
  const sa = Math.sin(-p.pitch);
  const cg = Math.cos(p.yaw);
  const sg = Math.sin(p.yaw);
  // Rz(roll)
  const x1 = lx * cb - ly * sb;
  const y1 = lx * sb + ly * cb;
  // Rx(-pitch)
  const y2 = y1 * ca - lz * sa;
  const z2 = y1 * sa + lz * ca;
  // Ry(yaw)
  out.x = p.x + x1 * cg + z2 * sg;
  out.y = p.y + y2;
  out.z = p.z - x1 * sg + z2 * cg;
  return out;
}

const tmp = { x: 0, y: 0, z: 0 };
const tmp2 = { x: 0, y: 0, z: 0 };
const TRACK_AMOUNT = [26, 32, 70, 75, 22, 85, 0, 0, 0];

export function surfaceAt(sim: Sim, x: number, z: number): Surface {
  const s = baseSurfaceAt(x, z);
  if (s === SURF.asphalt || s === SURF.concrete) return s;
  return sim.mask.tilledAt(x, z) > 0.5 ? SURF.tilled : s;
}

function collide(sim: Sim, lz: number, r: number) {
  const tr = sim.tr;
  const cx = tr.x + Math.sin(tr.yaw) * lz;
  const cz = tr.z + Math.cos(tr.yaw) * lz;
  let hit = false;
  for (const c of COLLIDERS) {
    const dx = cx - c.x;
    const dz = cz - c.z;
    if (Math.abs(dx) > 16 || Math.abs(dz) > 16) continue;
    if (c.k === "c") {
      const d = Math.hypot(dx, dz);
      const m = c.r + r;
      if (d < m && d > 1e-4) {
        tr.x += (dx / d) * (m - d);
        tr.z += (dz / d) * (m - d);
        hit = true;
      }
    } else {
      const lx = dx * c.c - dz * c.s;
      const lzz = dx * c.s + dz * c.c;
      const qx = clamp(lx, -c.hx, c.hx);
      const qz = clamp(lzz, -c.hz, c.hz);
      let nx = lx - qx;
      let nz = lzz - qz;
      let d = Math.hypot(nx, nz);
      let push = 0;
      if (d < 1e-4) {
        // center inside the box: push out along the shallow axis
        const px = c.hx - Math.abs(lx);
        const pz = c.hz - Math.abs(lzz);
        if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + r; } else { nx = 0; nz = Math.sign(lzz) || 1; push = pz + r; }
        d = 1;
      } else if (d < r) push = r - d;
      if (push > 0) {
        nx /= d;
        nz /= d;
        // back to world
        tr.x += (nx * c.c + nz * c.s) * push;
        tr.z += (-nx * c.s + nz * c.c) * push;
        hit = true;
      }
    }
  }
  return hit;
}

export function stepSim(sim: Sim, inp: SimInput, dtIn: number) {
  const dt = Math.min(dtIn, 0.05);
  const { tr, imp, mask } = sim;
  tr.t += dt;

  // ---- engine & controls ----
  if (inp.engineOn && !tr.engine) {
    tr.engine = true;
    tr.crankEnd = tr.t + TR.CRANK_TIME;
    tr.rpm = 0;
    sim.events.push({ type: "crank" });
  } else if (!inp.engineOn && tr.engine) {
    tr.engine = false;
    sim.events.push({ type: "stall" });
  }
  const running = tr.engine && tr.t >= tr.crankEnd;
  tr.running = running;
  tr.gas += clamp(inp.throttle - tr.gas, -3 * dt, 2.2 * dt);
  tr.brake += clamp(inp.brake - tr.brake, -6 * dt, 6 * dt);
  const st = clamp(inp.steer, -1, 1);
  const rate = st === 0 || Math.sign(st) !== Math.sign(tr.steer) ? TR.STEER_RATE * 1.4 : TR.STEER_RATE;
  tr.steer += clamp(st - tr.steer, -rate * dt, rate * dt);
  tr.dir = inp.dir;

  // ---- ground contact at the four wheels ----
  const sy = Math.sin(tr.yaw);
  const cy = Math.cos(tr.yaw);
  const H = (lx: number, lz: number) => heightAt(tr.x + lx * cy + lz * sy, tr.z - lx * sy + lz * cy);
  const hFL = H(TR.HALF_TRACK, TR.FRONT_Z);
  const hFR = H(-TR.HALF_TRACK, TR.FRONT_Z);
  const hRL = H(TR.HALF_TRACK, TR.REAR_Z);
  const hRR = H(-TR.HALF_TRACK, TR.REAR_Z);
  const hf = (hFL + hFR) / 2;
  const hr = (hRL + hRR) / 2;
  const tPitch = Math.atan2(hf - hr, TR.WHEELBASE);
  const tRoll = Math.atan2((hFL + hRL) / 2 - (hFR + hRR) / 2, TR.HALF_TRACK * 2);
  const g0 = hr + ((hf - hr) * -TR.REAR_Z) / TR.WHEELBASE;

  const comp = g0 + TR.G / TR.SUSP_K - tr.y;
  const grounded = comp > -0.04;
  if (grounded && !tr.grounded && tr.vy < -2.2) sim.events.push({ type: "land", strength: -tr.vy });
  tr.grounded = grounded;
  let ay = -TR.G;
  if (comp > 0) ay += TR.SUSP_K * comp - TR.SUSP_C * tr.vy;
  tr.vy += ay * dt;
  tr.y += tr.vy * dt;
  if (tr.y < g0 - 0.25) {
    tr.y = g0 - 0.25;
    if (tr.vy < 0) tr.vy = 0;
  }
  if (grounded) {
    tr.vp += (TR.ANG_K * (tPitch - tr.pitch) - TR.ANG_C * tr.vp) * dt;
    tr.vr += (TR.ANG_K * (tRoll - tr.roll) - TR.ANG_C * tr.vr) * dt;
  }
  tr.pitch += tr.vp * dt;
  tr.roll += tr.vr * dt;

  // ---- drive ----
  const surf = surfaceAt(sim, tr.x, tr.z);
  tr.surface = surf;
  const crr = SURF_CRR[surf]!;
  const mu = SURF_MU[surf]!;
  let aDrive = 0;
  tr.slip = 0;
  if (running && tr.gas > 0.02 && grounded) {
    const vmax = tr.dir > 0 ? TR.VMAX_F : TR.VMAX_R;
    const along = tr.dir * tr.v;
    const f = along < 0 ? 1.2 : clamp(1 - (along / vmax) ** 2, 0, 1);
    aDrive = tr.dir * TR.DRIVE * tr.gas * f;
    const lim = mu * TR.G * 0.85;
    tr.slip = Math.max(0, Math.abs(aDrive) - lim) / TR.DRIVE;
    aDrive = clamp(aDrive, -lim, lim);
  }
  const aSlope = grounded ? -TR.G * Math.sin(tPitch) : 0;
  let resist = grounded ? crr * TR.G + tr.brake * TR.BRAKE : 0;
  if (running && tr.gas < 0.05) resist += TR.ENGINE_BRAKE;
  resist += imp.draft;
  const v0 = tr.v;
  tr.v += (aDrive + aSlope) * dt;
  const dec = resist * dt;
  tr.v = Math.abs(tr.v) <= dec ? 0 : tr.v - Math.sign(tr.v) * dec;
  // in gear with the clutch engaged the tractor holds still on a slope
  if (grounded && tr.gas < 0.03 && Math.abs(tr.v) < 0.25) tr.v = 0;

  if (grounded) {
    const d = (tr.steer * TR.STEER_MAX) / (1 + Math.abs(tr.v) * 0.08);
    const yr = (-tr.v * Math.tan(d)) / TR.WHEELBASE;
    tr.yaw = wrapAngle(tr.yaw + yr * dt);
    tr.yawRate = lerp(tr.yawRate, yr, damp(6, dt));
  }
  tr.x += Math.sin(tr.yaw) * tr.v * dt;
  tr.z += Math.cos(tr.yaw) * tr.v * dt;
  if (Math.abs(tr.x) > MAP_LIMIT || Math.abs(tr.z) > MAP_LIMIT) {
    tr.x = clamp(tr.x, -MAP_LIMIT, MAP_LIMIT);
    tr.z = clamp(tr.z, -MAP_LIMIT, MAP_LIMIT);
    tr.v *= 0.5;
  }

  // ---- collisions ----
  let hit = false;
  for (const lz of TR.BODY_CIRCLES) hit = collide(sim, lz, TR.BODY_R) || hit;
  if (imp.attached) hit = collide(sim, hitchPoint(tr.lift).z + IMPL.tineZ - 0.3, 1.45) || hit;
  if (hit) {
    if (Math.abs(tr.v) > 1.6) sim.events.push({ type: "bump", strength: Math.abs(tr.v) });
    tr.v *= 0.35;
  }
  tr.accel = lerp(tr.accel, (tr.v - v0) / dt, damp(6, dt));
  tr.wheelDist += tr.v * dt + tr.dir * tr.slip * dt * 5;

  // ---- hydraulic lift ----
  tr.liftCmd = inp.liftCmd;
  if (inp.liftCmd !== 0 && !running && tr.t % 1.5 < dt) sim.events.push({ type: "noHydraulics" });
  const prevLift = tr.lift;
  if (running) tr.lift = clamp(tr.lift + (inp.liftCmd * dt) / HITCH.strokeTime, 0, 1);
  tr.liftMoving = tr.lift !== prevLift;

  // ---- implement ----
  const hp = hitchPoint(tr.lift);
  toWorld(tr, 0, hp.y, hp.z, tmp);
  sim.attachDist = Math.hypot(tmp.x - imp.x, tmp.z - imp.z);
  sim.canAttach =
    !imp.attached && sim.attachDist < TR.ATTACH_DIST && Math.abs(wrapAngle(tr.yaw - imp.yaw)) < TR.ATTACH_YAW;
  if (inp.attachPressed) {
    if (imp.attached) {
      imp.attached = false;
      imp.vy = 0;
      imp.hasPrev = false;
      sim.events.push({ type: "detach" });
    } else if (sim.canAttach) {
      imp.attached = true;
      imp.blend = 0;
      imp.from = { x: imp.x, y: imp.y, z: imp.z, yaw: imp.yaw, pitch: imp.pitch, roll: imp.roll };
      sim.events.push({ type: "attach" });
    } else sim.events.push({ type: "attachFail" });
  }

  if (imp.attached) {
    imp.blend = Math.min(1, imp.blend + dt / 0.35);
    imp.x = tmp.x;
    imp.y = tmp.y;
    imp.z = tmp.z;
    imp.yaw = tr.yaw;
    imp.pitch = tr.pitch;
    imp.roll = tr.roll;
    toWorld(tr, 0, hp.y + IMPL.tineTipY, hp.z + IMPL.tineZ, tmp2);
    const depth = heightAt(tmp2.x, tmp2.z) - tmp2.y;
    imp.depth = depth;
    const moving = Math.abs(tr.v) > 0.12;
    imp.working = depth > 0.03 && moving && imp.blend >= 1;
    if (imp.working && imp.hasPrev) {
      sim.tilledM2 += mask.paintTill(imp.px, imp.pz, tmp2.x, tmp2.z, IMPL.halfWidth, isTillable);
    }
    imp.px = tmp2.x;
    imp.pz = tmp2.z;
    imp.hasPrev = true;
    if (depth > 0.03) {
      const soft = mask.tilledAt(tmp2.x, tmp2.z) > 0.5 ? 0.55 : 1;
      imp.draft = TR.DRAFT * clamp(depth / 0.18, 0, 1.3) * soft;
    } else imp.draft = 0;
    if (depth > -0.06) imp.rollerA += (tr.v * dt) / 0.2;
  } else {
    imp.working = false;
    imp.draft = 0;
    imp.depth = 0;
    const s2 = Math.sin(imp.yaw);
    const c2 = Math.cos(imp.yaw);
    const G = (lx: number, lz: number) => heightAt(imp.x + lx * c2 + lz * s2, imp.z - lx * s2 + lz * c2);
    const gF = G(0, -0.3);
    const gB = G(0, -1.95);
    const gL = G(1.4, -1.0);
    const gR = G(-1.4, -1.0);
    const restY = gF + IMPL.restY;
    imp.vy -= TR.G * dt;
    imp.y += imp.vy * dt;
    if (imp.y <= restY) {
      if (imp.vy < -2) sim.events.push({ type: "thud", strength: -imp.vy });
      imp.y = restY;
      imp.vy = 0;
    }
    imp.pitch = lerp(imp.pitch, Math.atan2(gF - gB, 1.65), damp(10, dt));
    imp.roll = lerp(imp.roll, Math.atan2(gL - gR, 2.8), damp(10, dt));
  }

  // ---- tyre tracks ----
  if (grounded && Math.abs(tr.v) > 0.08) {
    tr.trackAcc += Math.abs(tr.v) * dt;
    if (tr.trackAcc > 0.22) {
      tr.trackAcc = 0;
      for (const [lx, lz, r] of [
        [TR.HALF_TRACK, TR.REAR_Z, 0.26], [-TR.HALF_TRACK, TR.REAR_Z, 0.26],
        [TR.HALF_TRACK, TR.FRONT_Z, 0.18], [-TR.HALF_TRACK, TR.FRONT_Z, 0.18],
      ] as const) {
        const wx = tr.x + lx * cy + lz * sy;
        const wz = tr.z - lx * sy + lz * cy;
        const amt = TRACK_AMOUNT[surfaceAt(sim, wx, wz)]!;
        if (amt > 0) mask.stampTrack(wx, wz, r, amt);
      }
    }
  }

  // ---- engine speed & load ----
  if (running) {
    const vmax = tr.dir > 0 ? TR.VMAX_F : TR.VMAX_R;
    const wheel = (Math.abs(tr.v) / vmax) * (TR.MAX_RPM - 250);
    let target = Math.max(TR.IDLE_RPM + tr.gas * (TR.MAX_RPM - TR.IDLE_RPM) * 0.7, wheel + (tr.gas > 0.05 ? 150 : 0));
    target += tr.slip * 350 - (imp.draft > 0 ? 140 * tr.gas : 0);
    tr.rpm = lerp(tr.rpm, clamp(target, TR.IDLE_RPM * 0.9, TR.MAX_RPM), damp(4, dt));
  } else if (tr.engine) {
    tr.rpm = 170 + 40 * Math.sin(tr.t * 25);
  } else tr.rpm = lerp(tr.rpm, 0, damp(2.2, dt));
  const climb = Math.max(0, -aSlope * Math.sign(tr.v || tr.dir)) / TR.G;
  tr.load = running
    ? clamp(tr.gas * 0.6 + (imp.draft / TR.DRAFT) * 0.45 + climb * 1.6 + (tr.liftMoving && inp.liftCmd > 0 ? 0.15 : 0), 0, 1)
    : 0;
}
