import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';
import type { Chunk, Layer, WorldMeta } from './types';
import { clamp } from './world';

const ground: Record<string, [number, number, number]> = {
  ground: [170, 160, 100], short_grass: [150, 170, 110],
  tall_grass: [100, 150, 80], forest_floor: [60, 95, 55],
  mud: [110, 85, 60], rock: [140, 135, 130],
  shallow_water: [90, 160, 200], deep_water: [30, 70, 130],
};

function heightColor(h: number, meta: WorldMeta): [number, number, number] {
  const { minHeight, maxHeight, seaLevel } = meta.terrain;
  if (h < seaLevel) {
    const t = clamp(1 - (seaLevel - h) / Math.max(1, seaLevel - minHeight), 0, 1);
    return [20 + 20 * t, 40 + 80 * t, 90 + 120 * t];
  }
  const t = clamp((h - seaLevel) / Math.max(1, maxHeight - seaLevel), 0, 1);
  const stops: [number, [number, number, number]][] = [
    [0, [214, 200, 150]], [0.05, [160, 180, 110]], [0.35, [90, 140, 70]],
    [0.7, [120, 110, 85]], [0.9, [170, 165, 160]], [1, [230, 230, 235]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) {
      const k = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      return stops[i][1].map((v, channel) => v + (stops[i + 1][1][channel] - v) * k) as [number, number, number];
    }
  }
  return stops[stops.length - 1][1];
}

export function makeTerrainImage(chunk: Chunk, layer: Layer, meta: WorldMeta): SkImage | null {
  const size = chunk.size;
  const heights = chunk.layers.height as number[] | undefined;
  const grounds = chunk.layers.groundType as string[] | undefined;
  const water = chunk.layers.waterDepth as number[] | undefined;
  if (!heights || !grounds || !water || heights.length !== size * size) return null;
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    let color: [number, number, number];
    if (layer === 'groundType') color = ground[grounds[i]] ?? [200, 50, 200];
    else if (layer === 'waterDepth' && water[i] > 0) {
      const t = clamp(water[i] / Math.max(1, meta.terrain.seaLevel - meta.terrain.minHeight), 0, 1);
      color = [50 - 30 * t, 140 - 60 * t, 200 - 40 * t];
    } else {
      color = heightColor(heights[i], meta);
      if (layer === 'waterDepth') color = color.map((v) => v * 0.55) as [number, number, number];
    }
    const offset = i * 4;
    pixels[offset] = Math.round(color[0]);
    pixels[offset + 1] = Math.round(color[1]);
    pixels[offset + 2] = Math.round(color[2]);
    pixels[offset + 3] = 255;
  }
  return Skia.Image.MakeImage({
    width: size, height: size,
    alphaType: AlphaType.Opaque, colorType: ColorType.RGBA_8888,
  }, Skia.Data.fromBytes(pixels), size * 4);
}
