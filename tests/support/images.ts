import sharp from "sharp";

let cachedPng: Buffer | null = null;
let cachedWebp: Buffer | null = null;

export async function validPngBuffer(): Promise<ArrayBuffer> {
  if (!cachedPng) {
    cachedPng = await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .png()
      .toBuffer();
  }
  const bytes = new Uint8Array(cachedPng!);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export async function validWebpBuffer(): Promise<ArrayBuffer> {
  if (!cachedWebp) {
    cachedWebp = await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 80, b: 10 } },
    })
      .webp()
      .toBuffer();
  }
  const bytes = new Uint8Array(cachedWebp!);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

let cachedOversizedWidthPng: Buffer | null = null;

export async function oversizedWidthPngBuffer(): Promise<ArrayBuffer> {
  if (!cachedOversizedWidthPng) {
    cachedOversizedWidthPng = await sharp({
      create: { width: 4097, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
  }
  const bytes = new Uint8Array(cachedOversizedWidthPng!);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}