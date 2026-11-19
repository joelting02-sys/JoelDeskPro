// Zero-dependency generator for Joel Desk Pro luxury Black & Gold "J" desktop icons (build/icon.png & build/icon.ico).
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function samplePixel(nx, ny, size) {
  const radius = 0.245;
  const borderWidth = Math.max(0.042, 1.5 / size);

  const dx = Math.max(radius - nx, 0, nx - (1 - radius));
  const dy = Math.max(radius - ny, 0, ny - (1 - radius));
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > radius) return [0, 0, 0, 0];

  const edgeDist = Math.min(nx, ny, 1 - nx, 1 - ny);
  const isBezel = dist >= radius - borderWidth || edgeDist < borderWidth;

  // Inner subtle hairline chamfer
  const innerDist = Math.min(nx - 0.095, ny - 0.095, 0.905 - nx, 0.905 - ny);
  const isInnerHairline =
    innerDist >= 0 && innerDist < 0.011 && dist < radius - borderWidth * 1.6;

  // Sculpted luxury editorial serif "J" monogram
  const isTopSerif = ny >= 0.245 && ny <= 0.305 && nx >= 0.48 && nx <= 0.725;
  const isStem = nx >= 0.555 && nx <= 0.655 && ny >= 0.285 && ny <= 0.605;
  const cx = 0.465;
  const cy = 0.595;
  const hookDist = Math.sqrt((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy));
  const isHookArc = ny >= cy - 0.01 && hookDist >= 0.095 && hookDist <= 0.19;
  const isLeftTerminal =
    Math.sqrt((nx - 0.335) * (nx - 0.335) + (ny - 0.635) * (ny - 0.635)) <= 0.056;
  const isDiamondFinial = Math.abs(nx - 0.36) + Math.abs(ny - 0.305) <= 0.032;

  const isGold = isTopSerif || isStem || isHookArc || isLeftTerminal || isDiamondFinial || isBezel;

  if (isGold) {
    const t = Math.min(1, Math.max(0, (nx * 0.52 + ny * 0.48)));
    const r = Math.round(253 - t * 55);
    const g = Math.round(233 - t * 76);
    const b = Math.round(162 - t * 108);
    return [r, g, b, 255];
  }

  // Deep obsidian radial metallic surface
  const dLight = Math.sqrt((nx - 0.3) * (nx - 0.3) + (ny - 0.22) * (ny - 0.22));
  const base = Math.max(8, Math.round(38 - dLight * 34));
  if (isInnerHairline) {
    return [Math.min(255, base + 56), Math.min(255, base + 44), Math.min(255, base + 14), 255];
  }
  return [base, base, Math.min(255, base + 5), 255];
}

function renderPng(size) {
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(stride * size);
  // 2x2 supersampling for crisp anti-aliased edges
  const offsets = [0.25, 0.75];

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const oy of offsets) {
        for (const ox of offsets) {
          const [sr, sg, sb, sa] = samplePixel((x + ox) / size, (y + oy) / size, size);
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const px = rowStart + 1 + x * 4;
      if (a > 0) {
        raw[px] = Math.round(r / a);
        raw[px + 1] = Math.round(g / a);
        raw[px + 2] = Math.round(b / a);
        raw[px + 3] = Math.round(a / 4);
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildIco(pngBuffers, sizes) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6 + count * 16);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(count, 4);

  let offset = header.length;
  for (let i = 0; i < count; i++) {
    const size = sizes[i];
    const png = pngBuffers[i];
    const entryOffset = 6 + i * 16;
    header[entryOffset] = size >= 256 ? 0 : size;
    header[entryOffset + 1] = size >= 256 ? 0 : size;
    header[entryOffset + 2] = 0;
    header[entryOffset + 3] = 0;
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    offset += png.length;
  }

  return Buffer.concat([header, ...pngBuffers]);
}

async function main() {
  const buildDir = path.resolve(process.cwd(), 'build');
  await fs.mkdir(buildDir, { recursive: true });

  const icon512 = renderPng(512);
  await fs.writeFile(path.join(buildDir, 'icon.png'), icon512);

  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoPngs = icoSizes.map((s) => renderPng(s));
  const icoBuffer = buildIco(icoPngs, icoSizes);
  await fs.writeFile(path.join(buildDir, 'icon.ico'), icoBuffer);

  console.log('[Joel Desk Pro] Generated build/icon.png (512x512) and build/icon.ico (multi-size)');
}

main();
