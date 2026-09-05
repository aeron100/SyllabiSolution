/**
 * Smoke test against the real Canvas export, when it is present. Skips
 * (does not fail) when the file is missing.
 *
 * The processing module is not involved here: raw page bodies are fed to the
 * assembler as both variants, so this exercises the final guard on real
 * content (21 YouTube iframes, data-api-* attributes, inline styles) and the
 * frame logic at realistic size. It does not assert the one-h1 rule because
 * heading normalization is the processing module's job.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { assembleDocument } from '../../src/lib/generate';
import type { ProcessedPage } from '../../src/lib/types';
import { PRESENTATIONS, count, makeDoc, parse } from './helpers';

const NAME = 'ics123-24142-onl-fund-data-structures-export.imscc';
// vitest runs from the project root; the absolute path is the documented location.
const CANDIDATES = [resolve(process.cwd(), NAME), `/Users/tqtran/Documents/SyllabusGenerator/${NAME}`];
const FILE = CANDIDATES.find((p) => existsSync(p)) ?? CANDIDATES[0]!;
const present = existsSync(FILE);

function bodyOf(html: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return (m ? m[1] : html) ?? '';
}

function loadPages(): ProcessedPage[] {
  const zip = unzipSync(new Uint8Array(readFileSync(FILE)), {
    filter: (f) => /^wiki_content\/.*\.html$/i.test(f.name) || /^course_settings\/syllabus\.html$/i.test(f.name),
  });
  const names = Object.keys(zip).sort();
  return names.map((name, i) => {
    const html = strFromU8(zip[name]!);
    const body = bodyOf(html);
    const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || name;
    return {
      resourceId: `res-${i}`,
      sectionId: `sec-${i + 1}`,
      title,
      kind: name.startsWith('course_settings/') ? 'syllabus' : 'page',
      original: body,
      neutral: body,
      report: [],
      notices: [],
      assetBytes: 0,
    };
  });
}

describe.skipIf(!present)('real export smoke', () => {
  const pages = present ? loadPages() : [];

  it('finds the wiki pages and the syllabus', () => {
    expect(pages.length).toBeGreaterThanOrEqual(30);
    expect(pages.some((p) => p.kind === 'syllabus')).toBe(true);
    // the raw content really does contain iframes that the guard must remove
    expect(pages.some((p) => /<iframe/i.test(p.original))).toBe(true);
  });

  it.each(PRESENTATIONS)('assembles all pages without script, iframes or handlers (%s)', (presentation) => {
    const out = assembleDocument(makeDoc(presentation, { pageBreaks: true }, {}, pages));
    const html = out.html;
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html.toLowerCase()).not.toContain('<iframe');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.toLowerCase()).not.toContain('javascript:');
    expect(count(html, /<section[\s>]/g)).toBe(pages.length);
    expect(out.bytes).toBe(new TextEncoder().encode(html).length);

    const d = parse(html);
    expect(d.querySelectorAll('script, iframe, object, embed, form').length).toBe(0);
    expect(d.querySelectorAll('nav.sg-toc a').length).toBe(pages.length);
    for (const a of Array.from(d.querySelectorAll('nav.sg-toc a'))) {
      expect(d.getElementById((a.getAttribute('href') ?? '').slice(1))).not.toBeNull();
    }
    // text survived the guard
    expect(d.querySelector('main')?.textContent?.length ?? 0).toBeGreaterThan(10_000);
  });

  it('is byte-identical across two runs', () => {
    const a = assembleDocument(makeDoc('styled', {}, {}, pages));
    const b = assembleDocument(makeDoc('styled', {}, {}, pages));
    expect(a.html).toBe(b.html);
    expect(a.bytes).toBe(b.bytes);
  });
});
