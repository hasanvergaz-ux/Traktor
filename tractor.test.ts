import { describe, expect, it } from "vitest";
import { HITCH, IMPL, hitchPoint } from "./hitch";
import { createSim, stepSim, toWorld, type Sim, type SimInput } from "./tractor";
import { PITS, heightAt, roadZ } from "./world";

const idle = (): SimInput => ({ throttle: 0, brake: 0, steer: 0, dir: 1, liftCmd: 0, engineOn: true, attachPressed: false });

function run(sim: Sim, seconds: number, inp: Partial<SimInput>) {
  const base = { ...idle(), ...inp };
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepSim(sim, base, 1 / 60);
    base.attachPressed = false;
    sim.events.length = 0;
  }
}

function startedSim() {
  const sim = createSim();
  run(sim, 3, {}); // crank + settle
  return sim;
}

/** Place the tractor at (x,z) with heading yaw, resting on the ground. */
function place(sim: Sim, x: number, z: number, yaw: number) {
  Object.assign(sim.tr, { x, z, yaw, v: 0, vy: 0, vp: 0, vr: 0, pitch: 0, roll: 0 });
  sim.tr.y = heightAt(x, z);
  run(sim, 0.5, {});
}

function attachInPlace(sim: Sim) {
  const hp = hitchPoint(sim.tr.lift);
  const p = toWorld(sim.tr, 0, hp.y, hp.z, { x: 0, y: 0, z: 0 });
  Object.assign(sim.imp, { x: p.x, z: p.z, yaw: sim.tr.yaw });
  run(sim, 1 / 60, { attachPressed: true });
  run(sim, 0.5, {});
}

describe("tractor engine & hydraulics", () => {
  it("only runs after the starter has cranked", () => {
    const sim = createSim();
    run(sim, 1, {});
    expect(sim.tr.running).toBe(false);
    run(sim, 1.5, {});
    expect(sim.tr.running).toBe(true);
  });

  it("raises the rear arms over a full stroke only while the engine runs", () => {
    const off = createSim();
    off.tr.lift = 0;
    run(off, 3, { engineOn: false, liftCmd: 1 });
    expect(off.tr.lift).toBe(0);

    const sim = startedSim();
    sim.tr.lift = 0;
    run(sim, HITCH.strokeTime + 0.1, { liftCmd: 1 });
    expect(sim.tr.lift).toBe(1);
    run(sim, HITCH.strokeTime / 2, { liftCmd: -1 });
    expect(sim.tr.lift).toBeGreaterThan(0.4);
    expect(sim.tr.lift).toBeLessThan(0.6);
  });

  it("lowered arms put the tines below the ground, raised arms lift them clear", () => {
    expect(hitchPoint(0).y + IMPL.tineTipY).toBeLessThan(-0.1);
    expect(hitchPoint(1).y + IMPL.tineTipY).toBeGreaterThan(0.4);
  });
});

describe("attaching the cultivator", () => {
  it("attaches when the hitch is right at the implement", () => {
    const sim = startedSim();
    attachInPlace(sim);
    expect(sim.imp.attached).toBe(true);
  });

  it("refuses to attach from 5 m away", () => {
    const sim = startedSim();
    Object.assign(sim.imp, { x: sim.tr.x + 20, z: sim.tr.z + 20 });
    run(sim, 1 / 60, { attachPressed: true });
    expect(sim.imp.attached).toBe(false);
  });

  it("detaches and leaves the implement where it was", () => {
    const sim = startedSim();
    attachInPlace(sim);
    const { x, z } = sim.imp;
    run(sim, 1 / 60, { attachPressed: true });
    run(sim, 2, { throttle: 1 });
    expect(sim.imp.attached).toBe(false);
    expect(Math.hypot(sim.imp.x - x, sim.imp.z - z)).toBeLessThan(0.05);
  });
});

describe("cultivating soil", () => {
  it("does not cultivate with the arms raised", () => {
    const sim = startedSim();
    place(sim, -40, 120, 0.4);
    attachInPlace(sim);
    sim.tr.lift = 1;
    run(sim, 8, { throttle: 0.6 });
    expect(sim.tilledM2).toBe(0);
  });

  it("cultivates a 3 m wide strip with the arms lowered", () => {
    const sim = startedSim();
    place(sim, -30, 90, 0.2);
    attachInPlace(sim);
    sim.tr.lift = 0;
    const x0 = sim.tr.x;
    const z0 = sim.tr.z;
    run(sim, 10, { throttle: 0.6 });
    const dist = Math.hypot(sim.tr.x - x0, sim.tr.z - z0);
    expect(dist).toBeGreaterThan(10);
    // ~3 m wide strip over the driven distance (cells are coarse, allow 25%)
    expect(sim.tilledM2 / dist).toBeGreaterThan(3 * 0.75);
    expect(sim.tilledM2 / dist).toBeLessThan(3 * 1.25);
  });

  it("never cultivates the asphalt road", () => {
    const sim = startedSim();
    place(sim, -170, roadZ(-170), Math.atan2(90, 18)); // driving east along the road centre
    attachInPlace(sim);
    sim.tr.lift = 0;
    run(sim, 8, { throttle: 0.5 });
    expect(sim.tilledM2).toBeLessThan(2);
  });
});

describe("pits", () => {
  it("drives into a deep muddy pit and climbs back out on full throttle", () => {
    const pit = PITS[2]!; // the big one, 2.2 m deep
    const sim = startedSim();
    // start 2 m from the center, heading out
    place(sim, pit.x - 2, pit.z, -Math.PI / 2);
    run(sim, 25, { throttle: 1 });
    expect(Math.hypot(sim.tr.x - pit.x, sim.tr.z - pit.z)).toBeGreaterThan(pit.r);
  });

  it("sits lower at the bottom of a pit than on its rim", () => {
    const pit = PITS[0]!;
    const sim = startedSim();
    place(sim, pit.x, pit.z, 0);
    const bottom = sim.tr.y;
    place(sim, pit.x + pit.r + 3, pit.z, 0);
    expect(sim.tr.y - bottom).toBeGreaterThan(pit.depth * 0.8);
  });
});
