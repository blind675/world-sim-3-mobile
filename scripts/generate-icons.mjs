import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A small reproducible icon generator; no graphics dependency is needed in CI.
const output = fileURLToPath(new URL('../assets/', import.meta.url));
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = table[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(size, pixel) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = pixel(x, y, size);
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (let channel = 0; channel < 4; channel++) rows[offset + channel] = color[channel];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function illustration(x, y, size, variant) {
  const u = (x - size / 2) / size;
  const v = (y - size / 2) / size;
  const diamond = Math.abs(u) + Math.abs(v);
  const mono = variant === 'mono';
  if (diamond > 0.39) return variant === 'icon' ? [13, 27, 39, 255] : [0, 0, 0, 0];
  if (diamond > 0.35) return mono ? [255, 255, 255, 255] : [24, 49, 63, 255];

  const coast = 0.04 + Math.sin(u * 11) * 0.045 + Math.sin(u * 21) * 0.018;
  let color = mono ? [255, 255, 255, 255] : v > coast ? [48, 122, 157, 255] : [105, 154, 89, 255];
  if (!mono && v < coast - 0.17) color = [68, 118, 75, 255];
  if (!mono && Math.abs(v - coast) < 0.018) color = [224, 196, 132, 255];

  const agentX = 0.03;
  const agentY = -0.075;
  const distance = Math.hypot(u - agentX, v - agentY);
  if (distance < 0.17 && distance > 0.145) color = mono ? [255, 255, 255, 255] : [255, 231, 166, 255];
  if (distance < 0.092) color = mono ? [255, 255, 255, 255] : [255, 163, 67, 255];
  if (distance < 0.045) color = mono ? [255, 255, 255, 255] : [255, 205, 100, 255];
  return color;
}

const background = () => [13, 27, 39, 255];
writeFileSync(join(output, 'icon.png'), encodePng(1024, (x, y, size) => illustration(x, y, size, 'icon')));
writeFileSync(join(output, 'android-icon-foreground.png'), encodePng(1024, (x, y, size) => illustration(x, y, size, 'foreground')));
writeFileSync(join(output, 'android-icon-monochrome.png'), encodePng(1024, (x, y, size) => illustration(x, y, size, 'mono')));
writeFileSync(join(output, 'android-icon-background.png'), encodePng(1024, background));
writeFileSync(join(output, 'favicon.png'), encodePng(64, (x, y, size) => illustration(x, y, size, 'icon')));
