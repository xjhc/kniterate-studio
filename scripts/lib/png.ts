import { crc32, deflateSync, inflateSync } from 'node:zlib';

/** Minimal PNG codec for the CLI: 8-bit, non-interlaced images in, RGBA out. */

export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function encodePng(image: RgbaImage): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(image.data.buffer, image.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(bytes: Buffer): RgbaImage {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  const data: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9]!;
      if (body[8] !== 8) throw new Error(`unsupported PNG bit depth ${body[8]}; convert to 8-bit`);
      if (body[12] !== 0) throw new Error('interlaced PNGs are not supported; save without interlacing');
      if (CHANNELS[colorType] === undefined) throw new Error(`unsupported PNG color type ${colorType}`);
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
  }
  if (width === 0 || height === 0) throw new Error('PNG has no image header');
  const channels = CHANNELS[colorType]!;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const source = y * (stride + 1) + 1;
    const target = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source + x]!;
      const left = x >= channels ? pixels[target + x - channels]! : 0;
      const up = y > 0 ? pixels[target - stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? pixels[target - stride + x - channels]! : 0;
      const predicted = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upLeft) : -1;
      if (predicted < 0) throw new Error(`invalid PNG filter ${filter}`);
      pixels[target + x] = (value + predicted) & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const at = index * channels;
    let r: number; let g: number; let b: number; let a = 255;
    if (colorType === 3) {
      const entry = pixels[at]!;
      if (palette === null) throw new Error('palette PNG without PLTE');
      r = palette[entry * 3]!; g = palette[entry * 3 + 1]!; b = palette[entry * 3 + 2]!;
      a = transparency !== null && entry < transparency.length ? transparency[entry]! : 255;
    } else if (colorType === 0 || colorType === 4) {
      r = g = b = pixels[at]!;
      if (colorType === 4) a = pixels[at + 1]!;
    } else {
      r = pixels[at]!; g = pixels[at + 1]!; b = pixels[at + 2]!;
      if (colorType === 6) a = pixels[at + 3]!;
    }
    rgba.set([r, g, b, a], index * 4);
  }
  return { width, height, data: rgba };
}
