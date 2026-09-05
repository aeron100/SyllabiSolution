/**
 * Image helpers: browser-only downscaling via <canvas>, and header-only
 * dimension sniffing for data URIs (works everywhere, decodes nothing).
 */

const RESIZABLE = /^image\/(?:png|jpe?g|webp|bmp)$/i;

/**
 * Downscale an image wider than `maxWidth`. Uses createImageBitmap + <canvas>;
 * in environments without them (jsdom) or on any failure the input is
 * returned unchanged. Never throws.
 */
export async function downscaleImage(
  bytes: Uint8Array,
  mime: string,
  maxWidth = 1600,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const same = { bytes, mime };
  try {
    if (!RESIZABLE.test(mime)) return same;
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return same;
    const dims = imageDimensions(bytes);
    if (dims && dims.width <= maxWidth) return same;

    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: mime });
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width <= maxWidth) {
      bitmap.close();
      return same;
    }
    const width = maxWidth;
    const height = Math.max(1, Math.round((bitmap.height * maxWidth) / bitmap.width));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return same;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const outMime = /png/i.test(mime) ? 'image/png' : 'image/jpeg';
    const out = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, outMime, 0.85);
      } catch {
        resolve(null);
      }
    });
    if (!out) return same;
    const outBytes = new Uint8Array(await out.arrayBuffer());
    if (!outBytes.length || outBytes.length >= bytes.length) return same;
    return { bytes: outBytes, mime: outMime };
  } catch {
    return same;
  }
}

export interface Dimensions {
  width: number;
  height: number;
}

/** Decode up to `maxBytes` of a base64 string. */
function base64Prefix(b64: string, maxBytes: number): Uint8Array | null {
  try {
    const chars = Math.min(b64.length, Math.ceil(maxBytes / 3) * 4);
    const slice = b64.slice(0, chars - (chars % 4)).replace(/[^A-Za-z0-9+/=]/g, '');
    const bin = atob(slice);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Width and height from the file header of a PNG, GIF, JPEG or WebP.
 * Accepts raw bytes or a data URI. Returns null when unknown.
 */
export function imageDimensions(input: Uint8Array | string): Dimensions | null {
  let b: Uint8Array | null;
  if (typeof input === 'string') {
    const comma = input.indexOf(',');
    if (!/^data:image\/[a-z+.-]+;base64,/i.test(input) || comma < 0) return null;
    b = base64Prefix(input.slice(comma + 1), 512 * 1024);
  } else {
    b = input;
  }
  if (!b || b.length < 12) return null;

  const be16 = (i: number): number => (b![i] << 8) | b![i + 1];
  const be32 = (i: number): number => ((b![i] << 24) | (b![i + 1] << 16) | (b![i + 2] << 8) | b![i + 3]) >>> 0;
  const le16 = (i: number): number => b![i] | (b![i + 1] << 8);
  const le24 = (i: number): number => b![i] | (b![i + 1] << 8) | (b![i + 2] << 16);
  const ascii = (i: number, n: number): string => String.fromCharCode(...Array.from(b!.subarray(i, i + n)));

  // PNG
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG' && b.length >= 24) {
    return { width: be32(16), height: be32(20) };
  }
  // GIF
  if (ascii(0, 4) === 'GIF8' && b.length >= 10) {
    return { width: le16(6), height: le16(8) };
  }
  // WebP
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP' && b.length >= 30) {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8 ') return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (chunk === 'VP8X') return { width: 1 + le24(24), height: 1 + le24(27) };
    return null;
  }
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { height: be16(i + 5), width: be16(i + 7) };
      if (marker === 0xd9 || marker === 0xda) return null;
      i += 2 + be16(i + 2);
    }
    return null;
  }
  return null;
}
