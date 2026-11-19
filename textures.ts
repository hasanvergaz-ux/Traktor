import * as THREE from "three";
import { asset } from "../assets";

const cache = new Map<string, Promise<unknown>>();
export function cached<T>(key: string, make: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = make();
    cache.set(key, p);
  }
  return p;
}

export function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });
}

let maxAniso = 8;
export const setMaxAnisotropy = (n: number) => {
  maxAniso = Math.min(8, n);
};

/** A repeating texture (color maps in sRGB, data maps linear). */
export function loadTex(name: string, srgb: boolean) {
  return cached(`tex:${name}`, async () => {
    const img = await loadImage(asset(name));
    const t = new THREE.Texture(img);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (srgb) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.internalFormat = "SRGB8_ALPHA8";
    }
    t.needsUpdate = true;
    return t;
  });
}

/** Cut-out foliage card (PNG with alpha). */
export function loadCard(name: string) {
  return cached(`card:${name}`, async () => {
    const img = await loadImage(asset(name));
    const t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    t.needsUpdate = true;
    return t;
  });
}

/** Stack same-purpose images into one texture array (one sampler for all terrain layers). */
export function loadArray(names: string[], size: number, srgb: boolean) {
  return cached(`arr:${names.join(",")}:${size}`, async () => {
    const imgs = await Promise.all(names.map((n) => loadImage(asset(n))));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const data = new Uint8Array(size * size * 4 * imgs.length);
    imgs.forEach((img, i) => {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      data.set(ctx.getImageData(0, 0, size, size).data, i * size * size * 4);
    });
    const t = new THREE.DataArrayTexture(data, size, size, imgs.length);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = maxAniso;
    if (srgb) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.internalFormat = "SRGB8_ALPHA8";
    }
    t.needsUpdate = true;
    return t;
  });
}
