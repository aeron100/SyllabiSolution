/**
 * DESIGN.md §12: axe-core against a generated document in Original and in
 * every Styled palette, plus the app's preview shell. jsdom has no layout,
 * so the colour-contrast rule is off here; the palette contrast test
 * (palettes.test.ts) covers colour with arithmetic instead.
 */
import { describe, it, expect } from 'vitest';
import axe from 'axe-core';
import { assembleDocument, themeCss } from '../../src/lib/generate';
import { PALETTES } from '../../src/lib/generate/colors';
import { buildPreviewSrcdoc } from '../../src/ui/preview';
import { PNG_1PX, PRESENTATIONS, everyKindPages, makeDoc, threePages } from './helpers';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Load a complete HTML document into the test window so axe can read it. */
function load(html: string): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.documentElement.setAttribute('lang', parsed.documentElement.getAttribute('lang') ?? '');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  document.body.className = parsed.body.className;
}

async function violations(html: string, bestPractice: boolean): Promise<string[]> {
  load(html);
  const result = await axe.run(document, {
    runOnly: { type: 'tag', values: bestPractice ? [...WCAG_TAGS, 'best-practice'] : WCAG_TAGS },
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations.map((v) => `${v.id} [${v.impact}]: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('axe: generated document', () => {
  it.each(PRESENTATIONS)('%s with every kind, cover, logo and contents has no violations (AA + best practice)', async (presentation) => {
    const html = assembleDocument(
      makeDoc(presentation, { pageBreaks: true }, { institution: 'Coastline College', logoDataUri: PNG_1PX }, everyKindPages()),
    ).html;
    expect(await violations(html, true)).toEqual([]);
  });

  it.each(PALETTES)('$name ($id) has no violations (AA + best practice)', async (p) => {
    const html = assembleDocument(makeDoc('styled', { palette: p.id }, {}, everyKindPages())).html;
    expect(await violations(html, true)).toEqual([]);
  });

  it('with the cover off, the h1 still comes first and the document passes', async () => {
    const html = assembleDocument(makeDoc('styled', { showCover: false }, {}, everyKindPages())).html;
    expect(await violations(html, true)).toEqual([]);
    expect(document.querySelector('h1, h2, h3, h4, h5, h6')?.tagName).toBe('H1');
  });

  it('with the contents off and a stamp, the document passes', async () => {
    const html = assembleDocument(makeDoc('original', { showToc: false, stamp: 'Generated for testing' }, {}, everyKindPages())).html;
    expect(await violations(html, true)).toEqual([]);
  });

  it('duplicate section titles keep every landmark name unique (AA + best practice, landmark-unique included)', async () => {
    const html = assembleDocument(makeDoc('styled', {}, {}, threePages())).html;
    expect(await violations(html, true)).toEqual([]);
  });
});

describe('axe: preview shell', () => {
  it.each(PRESENTATIONS)('one section in the %s look passes WCAG A/AA', async (presentation) => {
    const section = everyKindPages().find((p) => p.kind === 'syllabus')!;
    const html = buildPreviewSrcdoc({
      title: section.title,
      sectionId: section.sectionId,
      kind: section.kind,
      presentation,
      html: presentation === 'original' ? section.original : section.neutral,
      css: themeCss(presentation),
      language: 'en',
    });
    expect(await violations(html, false)).toEqual([]);
  });
});
