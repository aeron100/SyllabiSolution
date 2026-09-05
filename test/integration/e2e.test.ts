/**
 * End-to-end pipeline test against the real Canvas export in the project
 * root: openCartridge → extractContent + processContent (with the real asset
 * and wiki resolvers) → assembleDocument for every presentation.
 *
 * Skips (does not fail) when the export is missing; it is never committed.
 * Also writes the modern and original outputs to test/output/ for manual
 * inspection (that directory is git-ignored).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractContent, makeAssetResolver, makeWikiResolver, openCartridge } from '../../src/lib/cartridge';
import { assembleDocument } from '../../src/lib/generate';
import { downscaleImage, processContent } from '../../src/lib/process';
import type { AssembledDoc, Cartridge, Kind, Presentation, ProcessedPage } from '../../src/lib/types';
import { buildSample } from '../fixtures/make-sample.mjs';

const NAME = 'ics123-24142-onl-fund-data-structures-export.imscc';
const CANDIDATES = [resolve(process.cwd(), NAME), `/Users/tqtran/Documents/SyllabusGenerator/${NAME}`];
const FILE = CANDIDATES.find((p) => existsSync(p)) ?? CANDIDATES[0]!;
const present = existsSync(FILE);
const OUTPUT_DIR = resolve(process.cwd(), 'test/output');

const PRESENTATIONS: Presentation[] = ['original', 'styled', 'styled', 'styled'];
const TASK_LIST_TITLE = 'M01 - Task List';

/** Unique resource ids in organization order, then unfiled (mirrors src/ui/tree.ts). */
function treeOrder(cart: Cartridge): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const walk = (items: Cartridge['items']): void => {
    for (const it of items) {
      if (it.resourceId && cart.resources.has(it.resourceId) && !seen.has(it.resourceId)) {
        seen.add(it.resourceId);
        out.push(it.resourceId);
      }
      walk(it.children);
    }
  };
  walk(cart.items);
  for (const id of cart.unfiled) if (!seen.has(id)) out.push(id);
  return out;
}

function firstOfKind(cart: Cartridge, order: string[], kind: Kind, extra?: (id: string) => boolean): string {
  for (const id of order) {
    const r = cart.resources.get(id);
    if (r && r.kind === kind && (!extra || extra(id))) return id;
  }
  throw new Error(`no resource of kind ${kind}`);
}

function byTitle(cart: Cartridge, order: string[], kind: Kind, title: string): string {
  for (const id of order) {
    const r = cart.resources.get(id);
    if (r && r.kind === kind && r.title === title) return id;
  }
  throw new Error(`no ${kind} titled ${title}`);
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function headingLevel(el: Element): number {
  return Number(el.localName.slice(1));
}

describe.skipIf(!present)('end-to-end pipeline on the real export', () => {
  let cart: Cartridge;
  let selection: string[];
  let sections: ProcessedPage[];
  let imageId: string;
  const docs = new Map<Presentation, AssembledDoc>();

  beforeAll(async () => {
    const buf = readFileSync(FILE);
    cart = await openCartridge(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    const order = treeOrder(cart);
    const isImage = (id: string): boolean => (cart.resources.get(id)?.meta.mime ?? '').startsWith('image/');
    imageId = firstOfKind(cart, order, 'file', isImage);

    // Same shape as the app: syllabus first, then in tree order.
    const picks = [
      firstOfKind(cart, order, 'syllabus'),
      byTitle(cart, order, 'page', TASK_LIST_TITLE),
      firstOfKind(cart, order, 'assignment'),
      firstOfKind(cart, order, 'discussion'),
      firstOfKind(cart, order, 'quiz'),
      firstOfKind(cart, order, 'tool'),
      imageId,
    ];
    selection = [picks[0]!, ...picks.slice(1).sort((a, b) => order.indexOf(a) - order.indexOf(b))];
    expect(new Set(selection).size).toBe(7);

    // Exactly what useSyllabus.getProcessed does.
    const resolveAsset = makeAssetResolver(cart, { downscale: downscaleImage });
    const resolveWikiRef = makeWikiResolver(cart);
    const selectedSections = new Map(selection.map((id) => [id, `sec-${id}`]));
    sections = [];
    for (const id of selection) {
      const resource = cart.resources.get(id)!;
      const content = await extractContent(cart, id);
      sections.push(
        await processContent(content, {
          sectionId: `sec-${id}`,
          sectionTitle: resource.title,
          selectedSections,
          resolveAsset,
          resolveWikiRef,
          language: 'en',
        }),
      );
    }

    for (const presentation of PRESENTATIONS) {
      docs.set(
        presentation,
        assembleDocument({
          options: { presentation, palette: 'sapphire-brass', showCover: true, showToc: true, pageBreaks: true, language: 'en' },
          cover: {
            courseTitle: cart.title,
            courseCode: cart.courseCode,
            term: cart.term,
            instructor: 'Dr. Example',
            email: 'instructor@example.edu',
            officeHours: 'Mon 2–4 pm',
            meetingTimes: 'Online',
          },
          sections,
        }),
      );
    }

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(resolve(OUTPUT_DIR, 'real-modern.html'), docs.get('styled')!.html);
    writeFileSync(resolve(OUTPUT_DIR, 'real-original.html'), docs.get('original')!.html);
  }, 120_000);

  it('picked one of each requested kind', () => {
    const kinds = selection.map((id) => cart.resources.get(id)!.kind);
    expect(kinds).toContain('syllabus');
    expect(kinds).toContain('page');
    expect(kinds).toContain('assignment');
    expect(kinds).toContain('discussion');
    expect(kinds).toContain('quiz');
    expect(kinds).toContain('tool');
    expect(kinds).toContain('file');
    expect(sections.map((s) => s.title)).toContain(TASK_LIST_TITLE);
    expect(sections.map((s) => s.sectionId)).toEqual(selection.map((id) => `sec-${id}`));
  });

  it.each(PRESENTATIONS)('%s output is script-free and placeholder-free', (presentation) => {
    const html = docs.get(presentation)!.html;
    const lower = html.toLowerCase();
    expect(lower).not.toContain('<script');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(lower).not.toContain('javascript:');
    expect(html).not.toContain('$IMS-CC-FILEBASE$');
    expect(html).not.toContain('$WIKI_REFERENCE$');
    expect(html).not.toContain('$CANVAS_');
    expect(html).not.toMatch(/href="[^"]*instructure\.com/i);

    const d = parse(html);
    expect(d.querySelectorAll('script, iframe, object, embed, form, style:not(head style)').length).toBe(0);
    for (const el of Array.from(d.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) expect(attr.name.toLowerCase().startsWith('on')).toBe(false);
    }
  });

  it.each(PRESENTATIONS)('%s output has one h1, 7 sections and a 7-link TOC', (presentation) => {
    const d = parse(docs.get(presentation)!.html);
    expect(d.querySelectorAll('h1').length).toBe(1);
    const secs = d.querySelectorAll('main > section.sg-section');
    expect(secs.length).toBe(7);
    const toc = Array.from(d.querySelectorAll('nav.sg-toc a'));
    expect(toc.length).toBe(7);
    // Every TOC link points at a real section, in document order.
    const ids = Array.from(secs).map((s) => s.id);
    expect(toc.map((a) => (a.getAttribute('href') ?? '').slice(1))).toEqual(ids);
    expect(ids).toEqual(selection.map((id) => `sec-${id}`));
    for (const s of Array.from(secs)) {
      const h2 = s.querySelector(':scope > h2');
      expect(h2).not.toBeNull();
      expect(s.getAttribute('aria-labelledby')).toBe(h2!.id);
    }
  });

  it('embeds the syllabus cover image and the image file section as data URIs', () => {
    const d = parse(docs.get('styled')!.html);

    // The Canvas syllabus page embeds "ICS C123 Cover.png" via $IMS-CC-FILEBASE$.
    const syllabus = d.getElementById(`sec-${selection[0]}`)!;
    expect(syllabus.classList.contains('sg-kind-syllabus')).toBe(true);
    const cover = syllabus.querySelector('img');
    expect(cover).not.toBeNull();
    expect(cover!.getAttribute('src')).toMatch(/^data:image\/png;base64,/);

    // The image file renders as a figure with its title as the caption and as the
    // alt, unless the title is only a filename: then the alt is cleared and the
    // image is reported as needing a description.
    const fileSection = d.getElementById(`sec-${imageId}`)!;
    const figure = fileSection.querySelector('figure img');
    const title = cart.resources.get(imageId)!.title;
    expect(figure).not.toBeNull();
    expect(figure!.getAttribute('src')).toMatch(/^data:image\//);
    expect(['', title]).toContain(figure!.getAttribute('alt'));
    expect(fileSection.querySelector('figcaption')?.textContent).toBe(title);
    const fileReport = sections.find((s) => s.resourceId === imageId)!.report;
    if (figure!.getAttribute('alt') === '') expect(fileReport.some((e) => e.code === 'image-missing-alt')).toBe(true);
    else expect(fileReport.some((e) => e.code === 'image-missing-alt')).toBe(false);

    // Every image in the document is embedded; no export path survives on any <img>.
    expect(docs.get('styled')!.html).toContain('data:image/');
    expect(d.querySelectorAll('img').length).toBeGreaterThanOrEqual(2);
    for (const img of Array.from(d.querySelectorAll('img'))) {
      expect(img.getAttribute('src')).toMatch(/^data:image\//);
    }
  });

  it.each(['styled', 'styled', 'styled'] as Presentation[])('every img in %s has an alt attribute', (presentation) => {
    const d = parse(docs.get(presentation)!.html);
    const imgs = Array.from(d.querySelectorAll('img'));
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) expect(img.hasAttribute('alt')).toBe(true);
  });

  it('strips inline styles in classic and keeps them in original', () => {
    const classic = parse(docs.get('styled')!.html);
    const styled = Array.from(classic.body.querySelectorAll('[style]'));
    expect(styled.map((el) => `${el.localName} ${el.getAttribute('style')}`)).toEqual([]);
    expect(docs.get('styled')!.html).not.toMatch(/<[a-z][^>]*\sstyle=/i);

    const original = parse(docs.get('original')!.html);
    expect(original.body.querySelectorAll('[style]').length).toBeGreaterThan(0);
    expect(docs.get('original')!.html).toMatch(/\sstyle="/);
  });

  it.each(PRESENTATIONS)('%s headings never skip a level inside a section', (presentation) => {
    const d = parse(docs.get(presentation)!.html);
    for (const s of Array.from(d.querySelectorAll('main > section.sg-section'))) {
      const hs = Array.from(s.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      expect(hs.length).toBeGreaterThan(0);
      expect(headingLevel(hs[0]!)).toBe(2);
      let prev = 2;
      for (const h of hs.slice(1)) {
        const level = headingLevel(h);
        expect(level).toBeGreaterThanOrEqual(3);
        expect(level).toBeLessThanOrEqual(prev + 1);
        prev = level;
      }
    }
  });

  it('reports fixes and remaining work', () => {
    const doc = docs.get('styled')!;
    expect(Array.isArray(doc.report.fixed)).toBe(true);
    expect(Array.isArray(doc.report.todo)).toBe(true);
    expect(doc.report.fixed.length).toBeGreaterThan(0);
    expect(doc.report.todo.length).toBeGreaterThan(0);
    for (const e of [...doc.report.fixed, ...doc.report.todo, ...doc.report.info]) {
      expect(e.sectionId).toBeTruthy();
      expect(e.sectionTitle).toBeTruthy();
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic across two full runs on the real export', async () => {
    const resolveAsset = makeAssetResolver(cart, { downscale: downscaleImage });
    const resolveWikiRef = makeWikiResolver(cart);
    const selectedSections = new Map(selection.map((id) => [id, `sec-${id}`]));
    const again: ProcessedPage[] = [];
    for (const id of selection) {
      const content = await extractContent(cart, id);
      again.push(
        await processContent(content, {
          sectionId: `sec-${id}`,
          sectionTitle: cart.resources.get(id)!.title,
          selectedSections,
          resolveAsset,
          resolveWikiRef,
          language: 'en',
        }),
      );
    }
    const doc = assembleDocument({
      options: { presentation: 'styled', palette: 'sapphire-brass', showCover: true, showToc: true, pageBreaks: true, language: 'en' },
      cover: {
        courseTitle: cart.title,
        courseCode: cart.courseCode,
        term: cart.term,
        instructor: 'Dr. Example',
        email: 'instructor@example.edu',
        officeHours: 'Mon 2–4 pm',
        meetingTimes: 'Online',
      },
      sections: again,
    });
    expect(doc.html).toBe(docs.get('styled')!.html);
    expect(doc.bytes).toBe(docs.get('styled')!.bytes);
  });

  it('renders each kind by its rule and surfaces the right notices', () => {
    const d = parse(docs.get('styled')!.html);
    const bodyOf = (kind: Kind): Element => d.querySelector(`main > section.sg-kind-${kind}`)!;

    // Quiz: summary line only, never the questions.
    expect(bodyOf('quiz').querySelector('p.sg-meta')?.textContent).toMatch(/question.*points.*Due/);
    // Assignment: description plus a points/due line; its YouTube embed became a link.
    expect(bodyOf('assignment').querySelector('p.sg-meta')).not.toBeNull();
    expect(bodyOf('assignment').querySelector('p.sg-embed a')?.getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
    // Tool: no launch URL anywhere.
    expect(bodyOf('tool').querySelectorAll('a').length).toBe(0);
    // Task list: links to the selected quiz/discussion/assignment became section anchors.
    const anchors = Array.from(bodyOf('page').querySelectorAll('a[href^="#"]')).map((a) => a.getAttribute('href')!.slice(1));
    expect(anchors.length).toBeGreaterThanOrEqual(3);
    for (const id of anchors) expect(d.getElementById(id)).not.toBeNull();

    const doc = docs.get('styled')!;
    expect(doc.notices).toEqual(['interactive-removed']);
    expect(doc.bytes).toBe(new TextEncoder().encode(doc.html).length);
    expect(doc.bytes).toBeGreaterThan(100_000); // the two embedded images
  });
});

// ---------------------------------------------------------------------------
// The synthetic fixture (test/fixtures/make-sample.mjs, built in memory) runs
// the same pipeline and is never skipped, so the end-to-end path is covered
// even without the real export. Nothing in the app bundles or fetches it.
// ---------------------------------------------------------------------------

describe('end-to-end pipeline on the synthetic fixture', () => {
  let cart: Cartridge;
  let selection: string[];
  let sections: ProcessedPage[];

  beforeAll(async () => {
    cart = await openCartridge(buildSample());
    const order = treeOrder(cart);
    const isImage = (id: string): boolean => (cart.resources.get(id)?.meta.mime ?? '').startsWith('image/');
    const picks = [
      firstOfKind(cart, order, 'syllabus'),
      firstOfKind(cart, order, 'page'),
      firstOfKind(cart, order, 'assignment'),
      firstOfKind(cart, order, 'discussion'),
      firstOfKind(cart, order, 'announcement'),
      firstOfKind(cart, order, 'quiz'),
      firstOfKind(cart, order, 'link'),
      firstOfKind(cart, order, 'tool'),
      firstOfKind(cart, order, 'file', isImage),
      firstOfKind(cart, order, 'file', (id) => !isImage(id)),
      firstOfKind(cart, order, 'other'),
    ];
    selection = [picks[0]!, ...picks.slice(1).sort((a, b) => order.indexOf(a) - order.indexOf(b))];
    expect(new Set(selection).size).toBe(picks.length);

    const resolveAsset = makeAssetResolver(cart, { downscale: downscaleImage });
    const resolveWikiRef = makeWikiResolver(cart);
    const selectedSections = new Map(selection.map((id) => [id, `sec-${id}`]));
    sections = [];
    for (const id of selection) {
      const content = await extractContent(cart, id);
      sections.push(
        await processContent(content, {
          sectionId: `sec-${id}`,
          sectionTitle: cart.resources.get(id)!.title,
          selectedSections,
          resolveAsset,
          resolveWikiRef,
          language: 'en',
        }),
      );
    }
  });

  it.each(PRESENTATIONS)('%s: every kind produces a valid, script-free section', (presentation) => {
    const doc = assembleDocument({
      options: { presentation, palette: 'sapphire-brass', showCover: true, showToc: true, pageBreaks: presentation !== 'styled', language: 'en' },
      cover: { courseTitle: cart.title, courseCode: cart.courseCode, term: cart.term },
      sections,
    });
    const html = doc.html;
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.toLowerCase()).not.toContain('javascript:');
    expect(html).not.toMatch(/\$IMS-CC-FILEBASE\$|\$WIKI_REFERENCE\$|\$CANVAS_/);

    const d = parse(html);
    expect(d.querySelectorAll('h1').length).toBe(1);
    const secs = Array.from(d.querySelectorAll('main > section.sg-section'));
    expect(secs.length).toBe(selection.length);
    expect(d.querySelectorAll('nav.sg-toc a').length).toBe(selection.length);
    expect(secs.map((s) => s.id)).toEqual(selection.map((id) => `sec-${id}`));
    for (const s of secs) {
      const hs = Array.from(s.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      expect(headingLevel(hs[0]!)).toBe(2);
      let prev = 2;
      for (const h of hs.slice(1)) {
        expect(headingLevel(h)).toBeLessThanOrEqual(prev + 1);
        prev = headingLevel(h);
      }
    }
    for (const img of Array.from(d.querySelectorAll('img'))) {
      expect(img.getAttribute('src')).toMatch(/^data:image\//);
      if (presentation !== 'original') expect(img.hasAttribute('alt')).toBe(true);
    }
    if (presentation !== 'original') expect(d.body.querySelectorAll('[style]').length).toBe(0);
    // Wiki links between selected pages became anchors that resolve.
    for (const a of Array.from(d.querySelectorAll('main a[href^="#"]'))) {
      expect(d.getElementById(a.getAttribute('href')!.slice(1))).not.toBeNull();
    }
    // The link kind keeps its external URL; the tool never exposes a launch URL.
    expect(d.querySelector('section.sg-kind-link a[href^="http"]')).not.toBeNull();
    expect(d.querySelectorAll('section.sg-kind-tool a').length).toBe(0);
    expect(doc.bytes).toBe(new TextEncoder().encode(html).length);
  });

  it('is deterministic and reports fixes', async () => {
    const make = (): AssembledDoc =>
      assembleDocument({
        options: { presentation: 'styled', palette: 'sapphire-brass', showCover: false, showToc: true, pageBreaks: true, language: 'en' },
        cover: { courseTitle: cart.title },
        sections,
      });
    const a = make();
    const b = make();
    expect(a.html).toBe(b.html);
    expect(a.report.fixed.length).toBeGreaterThan(0);
    expect(a.notices).toContain('interactive-removed');
  });

  it('explains sections that render as a title only, and never repeats a tool title as body text', () => {
    const other = sections.find((s) => s.kind === 'other')!;
    expect(other.neutral).toBe('');
    expect(other.report.map((e) => e.code)).toEqual(['title-only']);
    const doc = assembleDocument({
      options: { presentation: 'styled', palette: 'sapphire-brass', showCover: false, showToc: false, pageBreaks: false, language: 'en' },
      cover: { courseTitle: cart.title },
      sections,
    });
    expect(doc.report.info.some((e) => e.code === 'title-only' && e.sectionId === other.sectionId)).toBe(true);
    const d = parse(doc.html);
    const tool = sections.find((s) => s.kind === 'tool')!;
    const toolSection = d.getElementById(tool.sectionId)!;
    for (const p of Array.from(toolSection.querySelectorAll('p'))) expect(p.textContent?.trim()).not.toBe(tool.title);
  });
});
