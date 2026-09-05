import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Cartridge, Kind } from '../../src/lib/types';

// Vitest runs with the project root as cwd (import.meta.url is an http: URL under jsdom).
export const PROJECT_ROOT = process.cwd();
export const REAL_EXPORT = resolve(PROJECT_ROOT, 'ics123-24142-onl-fund-data-structures-export.imscc');
export const hasRealExport = existsSync(REAL_EXPORT);

export function readRealExport(): Uint8Array {
  return new Uint8Array(readFileSync(REAL_EXPORT));
}

export function kindCounts(cart: Cartridge): Record<Kind, number> {
  const counts: Record<Kind, number> = {
    page: 0,
    syllabus: 0,
    assignment: 0,
    discussion: 0,
    announcement: 0,
    quiz: 0,
    link: 0,
    tool: 0,
    file: 0,
    other: 0,
  };
  for (const r of cart.resources.values()) counts[r.kind] += 1;
  return counts;
}

export function firstOfKind(cart: Cartridge, kind: Kind): string {
  for (const r of cart.resources.values()) if (r.kind === kind) return r.id;
  throw new Error(`no resource of kind ${kind}`);
}
