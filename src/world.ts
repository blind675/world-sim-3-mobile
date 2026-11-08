import type { Camera, ViewRect, WorldMeta } from './types';

export function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

export function nearestWrapped(value: number, center: number, size: number): number {
  return value + Math.round((center - value) / size) * size;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function minZoom(width: number, height: number, chunkSize: number): number {
  // Keep the map to roughly six visible chunks per axis. Wider views need
  // lower-resolution terrain from the backend rather than hundreds of JSON tiles.
  return Math.max(0.8, width / (6 * chunkSize), height / (6 * chunkSize));
}

export function visibleChunks(camera: Camera, width: number, height: number, meta: WorldMeta, padding = 1) {
  const cs = meta.chunkSize;
  const left = camera.cx - width / (2 * camera.ppc);
  const top = camera.cy - height / (2 * camera.ppc);
  return {
    minX: Math.floor(left / cs) - padding,
    minY: Math.floor(top / cs) - padding,
    maxX: Math.floor((left + width / camera.ppc) / cs) + padding,
    maxY: Math.floor((top + height / camera.ppc) / cs) + padding,
  };
}

export function viewportRect(camera: Camera, width: number, height: number, meta: WorldMeta): ViewRect {
  const range = visibleChunks(camera, width, height, meta, 0);
  const cs = meta.chunkSize;
  // The API caps each side at 2048 cells. The zoom floor keeps the actual view within this area.
  return {
    x: range.minX * cs,
    y: range.minY * cs,
    w: Math.min(2048, (range.maxX - range.minX + 1) * cs),
    h: Math.min(2048, (range.maxY - range.minY + 1) * cs),
  };
}
