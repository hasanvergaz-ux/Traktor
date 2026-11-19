// Shared GPU resources: the soil mask texture, terrain height & grass-density textures,
// and the time uniform every swaying plant reads.
import * as THREE from "three";
import { FieldMask } from "../sim/field";
import { MAP_SIZE, SURF, baseSurfaceAt, heightAt, inRect, FIELDS, COLLIDERS } from "../sim/world";

export const uTime = { value: 0 };
export const mask = new FieldMask(2048);

let maskTex: THREE.DataTexture | null = null;
export function getMaskTexture() {
  if (!maskTex) {
    maskTex = new THREE.DataTexture(mask.data, mask.n, mask.n, THREE.RGBAFormat, THREE.UnsignedByteType);
    maskTex.magFilter = THREE.LinearFilter;
    maskTex.minFilter = THREE.LinearMipmapLinearFilter;
    maskTex.generateMipmaps = true;
    maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
    maskTex.needsUpdate = true;
  }
  return maskTex;
}

/** Push changed rows of the soil mask to the GPU. */
export function uploadMask() {
  const t = getMaskTexture();
  const n = mask.n;
  const any = mask.consumeDirty((row, c0, c1) => {
    t.addUpdateRange((row * n + c0) * 4, (c1 - c0 + 1) * 4);
  });
  if (any) t.needsUpdate = true;
}

// Terrain grid: 2 m cells over the inner map. The mesh and the grass both read these heights.
export const GRID = 300;
export const CELL = MAP_SIZE / GRID;
let heights: Float32Array | null = null;
export function getHeights() {
  if (!heights) {
    const n = GRID + 1;
    heights = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++)
      for (let ix = 0; ix < n; ix++) heights[iz * n + ix] = heightAt(-MAP_SIZE / 2 + ix * CELL, -MAP_SIZE / 2 + iz * CELL);
  }
  return heights;
}

let heightTex: THREE.DataTexture | null = null;
export function getHeightTexture() {
  if (!heightTex) {
    heightTex = new THREE.DataTexture(getHeights(), GRID + 1, GRID + 1, THREE.RedFormat, THREE.FloatType);
    heightTex.magFilter = heightTex.minFilter = THREE.NearestFilter;
    heightTex.needsUpdate = true;
  }
  return heightTex;
}

/** Where wild grass grows (0..1), sampled on the same 2 m grid. */
let densityTex: THREE.DataTexture | null = null;
export function getDensityTexture() {
  if (!densityTex) {
    const n = GRID;
    const d = new Uint8Array(n * n);
    for (let iz = 0; iz < n; iz++)
      for (let ix = 0; ix < n; ix++) {
        const x = -MAP_SIZE / 2 + (ix + 0.5) * CELL;
        const z = -MAP_SIZE / 2 + (iz + 0.5) * CELL;
        const s = baseSurfaceAt(x, z);
        let v = s === SURF.grass ? 1 : 0;
        if (v) {
          for (const f of FIELDS) if (inRect(x, z, { x0: f.x0 - 1.5, z0: f.z0 - 1.5, x1: f.x1 + 1.5, z1: f.z1 + 1.5 })) v = 0;
          for (const c of COLLIDERS)
            if (c.k === "b") {
              const dx = x - c.x;
              const dz = z - c.z;
              if (Math.abs(dx * c.c - dz * c.s) < c.hx + 0.5 && Math.abs(dx * c.s + dz * c.c) < c.hz + 0.5) v = 0;
            }
        }
        d[iz * n + ix] = v * 255;
      }
    densityTex = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.UnsignedByteType);
    densityTex.magFilter = densityTex.minFilter = THREE.LinearFilter;
    densityTex.needsUpdate = true;
  }
  return densityTex;
}
