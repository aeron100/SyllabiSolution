import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createZipIndex, toBytes } from '../../src/lib/cartridge/unzip';
import { openCartridge } from '../../src/lib/cartridge';

const MANIFEST = `<?xml version="1.0"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <metadata><schemaversion>1.1.0</schemaversion></metadata>
  <organizations/>
  <resources>
    <resource identifier="r1" type="webcontent" href="pages/Intro.html"><file href="pages/Intro.html"/></resource>
  </resources>
</manifest>`;

function tinyZip(): Uint8Array {
  return zipSync(
    {
      'imsmanifest.xml': strToU8(MANIFEST),
      'web_resources/Uploaded Media/Canvas-Logo.png': new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
      'Dir/File.TXT': strToU8('hello'),
      'pages/Intro.html': strToU8('<html><body><p>Hi</p></body></html>'),
      'empty-dir/': new Uint8Array(0),
      'bom.txt': new Uint8Array([0xef, 0xbb, 0xbf, 0x61]),
    },
    { mtime: new Date(Date.UTC(2026, 0, 1)) },
  );
}

describe('ZipIndex', () => {
  const zip = createZipIndex(tinyZip());

  it('lists file entries only', () => {
    const names = zip.names();
    expect(names).toContain('imsmanifest.xml');
    expect(names).toContain('web_resources/Uploaded Media/Canvas-Logo.png');
    expect(names.some((n) => n.endsWith('/'))).toBe(false);
    expect(zip.has('Dir/File.TXT')).toBe(true);
    expect(zip.has('dir/file.txt')).toBe(false);
  });

  it('resolves URL-encoded paths, query strings, leading ./ and /, and case differences', () => {
    const want = 'web_resources/Uploaded Media/Canvas-Logo.png';
    expect(zip.resolve('web_resources/Uploaded%20Media/Canvas-Logo.png?canvas_=1')).toBe(want);
    expect(zip.resolve('./web_resources/Uploaded Media/Canvas-Logo.png')).toBe(want);
    expect(zip.resolve('/web_resources/Uploaded%20Media/Canvas-Logo.png#frag')).toBe(want);
    expect(zip.resolve('WEB_RESOURCES/uploaded media/canvas-logo.png')).toBe(want);
    expect(zip.resolve('web_resources/../web_resources/Uploaded Media/Canvas-Logo.png')).toBe(want);
    expect(zip.resolve('dir/file.txt')).toBe('Dir/File.TXT');
    expect(zip.resolve('nope.png')).toBeNull();
    expect(zip.resolve('')).toBeNull();
    expect(zip.resolve('%E0%A4%A')).toBeNull(); // malformed escape must not throw
  });

  it('reports sizes and extracts lazily', async () => {
    expect(zip.size('Dir/File.TXT')).toBe(5);
    expect(zip.size('missing')).toBeUndefined();
    expect(await zip.text('dir/file.txt')).toBe('hello');
    expect(Array.from(await zip.bytes('web_resources/Uploaded%20Media/Canvas-Logo.png'))).toEqual([
      137, 80, 78, 71, 1, 2, 3,
    ]);
    await expect(zip.bytes('missing')).rejects.toThrow(/Not in cartridge/);
  });

  it('strips a UTF-8 BOM from text', async () => {
    expect(await zip.text('bom.txt')).toBe('a');
  });

  it('re-roots at a nested folder', () => {
    const nested = zipSync({ 'export/imsmanifest.xml': strToU8(MANIFEST), 'export/a.txt': strToU8('x') });
    const idx = createZipIndex(nested, 'export/');
    expect(idx.names()).toEqual(['imsmanifest.xml', 'a.txt']);
  });
});

describe('toBytes', () => {
  it('accepts Uint8Array, ArrayBuffer, and Blob', async () => {
    const u8 = new Uint8Array([1, 2, 3]);
    expect(await toBytes(u8)).toBe(u8);
    expect(Array.from(await toBytes(u8.buffer.slice(0)))).toEqual([1, 2, 3]);
    expect(Array.from(await toBytes(new Blob([u8])))).toEqual([1, 2, 3]);
  });
});

describe('openCartridge on a minimal generic cartridge', () => {
  it('parses a generic CC with no course_settings and a nested manifest folder', async () => {
    const nested = zipSync({
      'course/imsmanifest.xml': strToU8(MANIFEST),
      'course/pages/Intro.html': strToU8('<html><head><title>Intro</title></head><body><p>Hi</p></body></html>'),
    });
    const cart = await openCartridge(nested);
    expect(cart.source).toBe('generic');
    expect(cart.version).toBe('1.1.0');
    expect(cart.title).toBe('Untitled course');
    expect(cart.items).toEqual([]);
    expect(cart.resources.get('r1')?.kind).toBe('page');
    expect(cart.resources.get('r1')?.title).toBe('Intro');
    expect(cart.unfiled).toEqual(['r1']);
  });

  it('rejects a zip with no manifest', async () => {
    await expect(openCartridge(zipSync({ 'a.txt': strToU8('x') }))).rejects.toThrow(/imsmanifest\.xml/);
  });
});
