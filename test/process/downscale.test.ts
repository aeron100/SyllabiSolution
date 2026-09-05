import { describe, expect, it } from 'vitest';
import { downscaleImage, imageDimensions } from '../../src/lib/process';
import { fakePng } from './helpers';

describe('downscaleImage', () => {
  it('returns the input unchanged where there is no canvas (jsdom) and never throws', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const out = await downscaleImage(bytes, 'image/png');
    expect(out.bytes).toBe(bytes);
    expect(out.mime).toBe('image/png');
    const svg = await downscaleImage(bytes, 'image/svg+xml', 10);
    expect(svg.bytes).toBe(bytes);
    const garbage = await downscaleImage(new Uint8Array(0), 'image/jpeg', 1);
    expect(garbage.bytes.length).toBe(0);
  });
});

describe('imageDimensions', () => {
  it('reads PNG headers from data URIs and bytes', () => {
    expect(imageDimensions(fakePng(1200, 400))).toEqual({ width: 1200, height: 400 });
    const b = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x08, 0x00, 0, 0]);
    expect(imageDimensions(b)).toEqual({ width: 16, height: 8 });
  });

  it('reads JPEG SOF markers past an APP segment', () => {
    // SOI, APP0 (len 16), SOF0 (len 17) with height 300, width 500
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0xf4, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    expect(imageDimensions(jpeg)).toEqual({ width: 500, height: 300 });
  });

  it('returns null for unknown data', () => {
    expect(imageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(imageDimensions('data:text/plain;base64,aGVsbG8=')).toBeNull();
    expect(imageDimensions('not a data uri')).toBeNull();
  });
});
