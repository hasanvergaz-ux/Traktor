// Soil state over the whole inner map: which cells are cultivated and where tyres left tracks.
// Stored as RGBA bytes so the scene can upload changed rows straight into a GPU texture.
//   R = cultivated (0/255), G = tyre track intensity, B = unused, A = 255
import { MAP_SIZE } from "./world";

export class FieldMask {
  readonly n: number;
  readonly cell: number;
  readonly data: Uint8Array;
  readonly cellArea: number;
  /** per-row dirty span [min,max] in cells, -1 when clean */
  private readonly rowMin: Int32Array;
  private readonly rowMax: Int32Array;
  private anyDirty = false;
  tilledCells = 0;

  constructor(n = 2048) {
    this.n = n;
    this.cell = MAP_SIZE / n;
    this.cellArea = this.cell * this.cell;
    this.data = new Uint8Array(n * n * 4);
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = 255;
    this.rowMin = new Int32Array(n).fill(-1);
    this.rowMax = new Int32Array(n).fill(-1);
  }

  toCell(v: number) {
    return Math.floor((v + MAP_SIZE / 2) / this.cell);
  }

  private mark(row: number, col: number) {
    const mn = this.rowMin[row]!;
    if (mn < 0 || col < mn) this.rowMin[row] = col;
    if (col > this.rowMax[row]!) this.rowMax[row] = col;
    this.anyDirty = true;
  }

  tilledAt(x: number, z: number) {
    const c = this.toCell(x);
    const r = this.toCell(z);
    if (c < 0 || r < 0 || c >= this.n || r >= this.n) return 0;
    return this.data[(r * this.n + c) * 4]! / 255;
  }

  /**
   * Cultivate a capsule from (ax,az) to (bx,bz) with radius `half`.
   * Returns the newly cultivated area in square meters.
   */
  paintTill(ax: number, az: number, bx: number, bz: number, half: number, tillable: (x: number, z: number) => boolean) {
    const n = this.n;
    const c0 = Math.max(0, this.toCell(Math.min(ax, bx) - half));
    const c1 = Math.min(n - 1, this.toCell(Math.max(ax, bx) + half));
    const r0 = Math.max(0, this.toCell(Math.min(az, bz) - half));
    const r1 = Math.min(n - 1, this.toCell(Math.max(az, bz) + half));
    const vx = bx - ax;
    const vz = bz - az;
    const vv = vx * vx + vz * vz || 1e-6;
    const h2 = half * half;
    let added = 0;
    for (let r = r0; r <= r1; r++) {
      const z = (r + 0.5) * this.cell - MAP_SIZE / 2;
      for (let c = c0; c <= c1; c++) {
        const i = (r * n + c) * 4;
        if (this.data[i] === 255) continue;
        const x = (c + 0.5) * this.cell - MAP_SIZE / 2;
        let t = ((x - ax) * vx + (z - az) * vz) / vv;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - vx * t;
        const dz = z - az - vz * t;
        if (dx * dx + dz * dz > h2) continue;
        if (!tillable(x, z)) continue;
        this.data[i] = 255;
        this.data[i + 1] = 0; // fresh soil erases old tyre marks
        this.mark(r, c);
        added++;
      }
    }
    this.tilledCells += added;
    return added * this.cellArea;
  }

  /** Darken a small disc where a tyre rolled. */
  stampTrack(x: number, z: number, radius: number, amount: number) {
    const n = this.n;
    const cc = this.toCell(x);
    const rc = this.toCell(z);
    const k = Math.ceil(radius / this.cell);
    const r2 = (radius / this.cell) ** 2;
    for (let r = rc - k; r <= rc + k; r++) {
      if (r < 0 || r >= n) continue;
      for (let c = cc - k; c <= cc + k; c++) {
        if (c < 0 || c >= n) continue;
        if ((r - rc) ** 2 + (c - cc) ** 2 > r2) continue;
        const i = (r * n + c) * 4 + 1;
        const v = this.data[i]!;
        if (v >= 230) continue;
        this.data[i] = Math.min(230, v + amount);
        this.mark(r, c);
      }
    }
  }

  /** Visit and clear every dirty row span. */
  consumeDirty(cb: (row: number, c0: number, c1: number) => void) {
    if (!this.anyDirty) return false;
    for (let r = 0; r < this.n; r++) {
      const mn = this.rowMin[r]!;
      if (mn < 0) continue;
      cb(r, mn, this.rowMax[r]!);
      this.rowMin[r] = -1;
      this.rowMax[r] = -1;
    }
    this.anyDirty = false;
    return true;
  }

  clear() {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = 0;
      this.data[i + 1] = 0;
    }
    this.tilledCells = 0;
    for (let r = 0; r < this.n; r++) {
      this.rowMin[r] = 0;
      this.rowMax[r] = this.n - 1;
    }
    this.anyDirty = true;
  }
}
