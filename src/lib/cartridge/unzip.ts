/**
 * ZipIndex over a raw zip buffer. The central directory is parsed once
 * (including per-entry zip64 extra fields, which Canvas exports use for
 * every web_resources file even without a zip64 end record); each entry is
 * inflated with fflate only when asked for, so a 47 MB export is never
 * decompressed wholesale.
 */
import { inflateSync } from 'fflate';
import type { ZipIndex } from '../types';
import { collapse, foldKey, normalizePath, stripQuery } from './paths';

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const MAX32 = 0xffffffff;

export interface ZipEntry {
  name: string;
  method: number;
  csize: number;
  usize: number;
  offset: number;
}

const u16 = (d: Uint8Array, p: number): number => d[p] | (d[p + 1] << 8);
const u32 = (d: Uint8Array, p: number): number => (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0;
const u64 = (d: Uint8Array, p: number): number => u32(d, p) + u32(d, p + 4) * 0x100000000;

const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const utf8 = new TextDecoder('utf-8');
let latin1: TextDecoder | null = null;

function decodeName(bytes: Uint8Array, utf8Flag: boolean): string {
  if (utf8Flag) return utf8.decode(bytes);
  try {
    return utf8Strict.decode(bytes);
  } catch {
    try {
      latin1 ??= new TextDecoder('latin1');
      return latin1.decode(bytes);
    } catch {
      return utf8.decode(bytes);
    }
  }
}

/** Parse the central directory. Throws when the buffer is not a zip. */
export function readCentralDirectory(d: Uint8Array): ZipEntry[] {
  const len = d.length;
  if (len < 22) throw new Error('Not a zip file.');
  const stop = Math.max(0, len - 22 - 0xffff);
  let e = len - 22;
  while (e >= stop && u32(d, e) !== SIG_EOCD) e--;
  if (e < stop) throw new Error('Not a zip file (no end-of-central-directory record).');

  let count = u16(d, e + 10);
  let cdOffset = u32(d, e + 16);
  if ((count === 0xffff || cdOffset === MAX32) && e >= 20 && u32(d, e - 20) === SIG_EOCD64_LOCATOR) {
    const z = u64(d, e - 20 + 8);
    if (z + 56 <= len && u32(d, z) === SIG_EOCD64) {
      count = u64(d, z + 32);
      cdOffset = u64(d, z + 48);
    }
  }

  const entries: ZipEntry[] = [];
  let o = cdOffset;
  for (let i = 0; i < count && o + 46 <= len; i++) {
    if (u32(d, o) !== SIG_CENTRAL) break;
    const flags = u16(d, o + 8);
    const method = u16(d, o + 10);
    let csize = u32(d, o + 20);
    let usize = u32(d, o + 24);
    const nameLen = u16(d, o + 28);
    const extraLen = u16(d, o + 30);
    const commentLen = u16(d, o + 32);
    let offset = u32(d, o + 42);
    const name = decodeName(d.subarray(o + 46, o + 46 + nameLen), (flags & 0x800) !== 0);

    if (usize === MAX32 || csize === MAX32 || offset === MAX32) {
      // zip64 extended information extra field (id 0x0001): 8-byte values for
      // exactly the fields that overflowed, in the order usize, csize, offset.
      let x = o + 46 + nameLen;
      const end = x + extraLen;
      while (x + 4 <= end) {
        const id = u16(d, x);
        const size = u16(d, x + 2);
        if (id === 0x0001) {
          let p = x + 4;
          const stopAt = Math.min(end, p + size);
          if (usize === MAX32 && p + 8 <= stopAt) {
            usize = u64(d, p);
            p += 8;
          }
          if (csize === MAX32 && p + 8 <= stopAt) {
            csize = u64(d, p);
            p += 8;
          }
          if (offset === MAX32 && p + 8 <= stopAt) offset = u64(d, p);
          break;
        }
        x += 4 + size;
      }
    }
    entries.push({ name, method, csize, usize, offset });
    o += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Inflate (or copy) one entry's bytes. */
export function extractEntry(d: Uint8Array, entry: ZipEntry): Uint8Array {
  const o = entry.offset;
  if (o + 30 > d.length || u32(d, o) !== SIG_LOCAL) throw new Error(`Corrupt zip entry: ${entry.name}`);
  const start = o + 30 + u16(d, o + 26) + u16(d, o + 28);
  const end = Math.min(d.length, start + entry.csize);
  const sub = d.subarray(start, end);
  if (entry.method === 0) return sub.slice();
  if (entry.method === 8) {
    return entry.usize < MAX32 ? inflateSync(sub, { out: new Uint8Array(entry.usize) }) : inflateSync(sub);
  }
  throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}

/** Accept Uint8Array | ArrayBuffer | Blob and give back one Uint8Array view. */
export async function toBytes(data: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    return v instanceof Uint8Array ? v : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  const anyData = data as { byteLength?: unknown; arrayBuffer?: unknown };
  if (typeof anyData.arrayBuffer === 'function') {
    return new Uint8Array(await (data as Blob).arrayBuffer());
  }
  if (typeof anyData.byteLength === 'number') {
    return new Uint8Array(data as ArrayBuffer);
  }
  // Very old Blob without arrayBuffer(): fall back to FileReader.
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsArrayBuffer(data as Blob);
  });
}

/**
 * Build an index over a zip. `base` (e.g. "export/") makes a zip whose
 * manifest sits inside a folder look like one rooted at that folder.
 */
export function createZipIndex(bytes: Uint8Array, base = ''): ZipIndex {
  const entries = new Map<string, ZipEntry>(); // logical name -> entry
  const folded = new Map<string, string>(); // foldKey(logical) -> logical

  for (const entry of readCentralDirectory(bytes)) {
    if (entry.name.endsWith('/')) continue; // directory
    if (base !== '' && !entry.name.startsWith(base)) continue;
    const logical = entry.name.slice(base.length);
    if (logical === '' || entries.has(logical)) continue;
    entries.set(logical, entry);
    const k = foldKey(logical);
    if (!folded.has(k)) folded.set(k, logical);
  }

  const resolve = (path: string): string | null => {
    const trimmed = path.trim();
    if (trimmed === '') return null;
    const candidates = [normalizePath(trimmed), collapse(stripQuery(trimmed))];
    for (const c of candidates) {
      if (c === '') continue;
      if (entries.has(c)) return c;
      const hit = folded.get(foldKey(c));
      if (hit) return hit;
    }
    return null;
  };

  const extract = (path: string): Uint8Array => {
    const name = resolve(path);
    if (name === null) throw new Error(`Not in cartridge: ${path}`);
    return extractEntry(bytes, entries.get(name) as ZipEntry);
  };

  const decoder = new TextDecoder('utf-8');

  return {
    names: () => Array.from(entries.keys()),
    has: (path) => entries.has(path),
    resolve,
    size: (path) => {
      const name = resolve(path);
      return name === null ? undefined : entries.get(name)?.usize;
    },
    bytes: async (path) => extract(path),
    text: async (path) => {
      const text = decoder.decode(extract(path));
      return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    },
  };
}

/** Read text, or null when the entry is missing (never throws). */
export async function readText(zip: ZipIndex, path: string | undefined): Promise<string | null> {
  if (!path || zip.resolve(path) === null) return null;
  try {
    return await zip.text(path);
  } catch {
    return null;
  }
}
