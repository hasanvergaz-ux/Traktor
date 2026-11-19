// Rear three-point linkage geometry in tractor-model coordinates
// (+Z forward, +Y up, +X = tractor's left side, origin on the ground between the axles).
// Both the physics (where the implement sits) and the drawing read these numbers.

const deg = Math.PI / 180;

export const HITCH = {
  lowerPivotY: 0.52,
  lowerPivotZ: -1.72,
  lowerPivotX: 0.34,
  ballX: 0.41,
  lowerLen: 0.95,
  angDown: -18 * deg, // fully lowered
  angUp: 32 * deg, // fully raised
  topPivot: { y: 1.22, z: -1.98 },
  liftPivot: { x: 0.31, y: 1.42, z: -1.6 },
  liftLen: 0.62,
  liftAngDown: -32 * deg,
  liftAngUp: 22 * deg,
  cylBase: { x: 0.44, y: 0.8, z: -1.3 },
  /** seconds for a full stroke, bottom to top */
  strokeTime: 2.4,
};

/** Implement-local points (origin = midpoint of the lower hitch pins). */
export const IMPL = {
  mastTop: { y: 0.66, z: -0.08 },
  tineZ: -1.0, // middle of the tine field
  tineTipY: -0.41,
  halfWidth: 1.5, // 3.0 m working width
  restY: 0.23, // hitch-pin height when parked on its stands
  rollerZ: -1.95,
};

export const lowerAngle = (u: number) => HITCH.angDown + (HITCH.angUp - HITCH.angDown) * u;

/** Hitch-ball midpoint (y, z) in tractor coordinates for lift position u in [0,1]. */
export function hitchPoint(u: number) {
  const a = lowerAngle(u);
  return {
    y: HITCH.lowerPivotY + HITCH.lowerLen * Math.sin(a),
    z: HITCH.lowerPivotZ - HITCH.lowerLen * Math.cos(a),
  };
}
