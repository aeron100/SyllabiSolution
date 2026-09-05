/**
 * Shared fixtures for the generate tests: fake ProcessedPages and a
 * SyllabusDoc factory. Not a test file itself.
 */
import { DEFAULT_PALETTE } from '../../src/lib/generate/colors';
import type { CoverInfo, DocOptions, Kind, Presentation, ProcessedPage, SyllabusDoc } from '../../src/lib/types';
import { KIND_LABEL } from '../../src/lib/types';

export const PRESENTATIONS: Presentation[] = ['original', 'styled'];

/** A 1×1 transparent PNG, small enough to embed in fixtures. */
export const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function page(over: Partial<ProcessedPage> & { sectionId: string; title: string }): ProcessedPage {
  return {
    resourceId: `res-${over.sectionId}`,
    kind: 'page',
    original: `<p style="color:red">Original ${over.title}</p>`,
    neutral: `<p>Neutral ${over.title}</p>`,
    report: [],
    notices: [],
    assetBytes: 0,
    ...over,
  };
}

/** Three pages; the last two share a title so the TOC must disambiguate. */
export function threePages(): ProcessedPage[] {
  return [
    page({
      sectionId: 'sec-a',
      title: 'Course Overview',
      kind: 'syllabus',
      report: [{ code: 'heading-normalized', severity: 'fixed', message: 'Headings normalized.', count: 2 }],
      notices: ['equations'],
    }),
    page({
      sectionId: 'sec-b',
      title: 'Week 1',
      kind: 'page',
      report: [
        { code: 'image-missing-alt', severity: 'todo', message: 'An image needs a description.', sectionTitle: 'Custom title' },
        { code: 'list-converted', severity: 'fixed', message: 'A list was converted.' },
      ],
      notices: ['media-omitted', 'equations'],
    }),
    page({
      sectionId: 'sec-c',
      title: 'Week 1',
      kind: 'assignment',
      report: [{ code: 'note', severity: 'info', message: 'Just so you know.' }],
      notices: ['missing-files'],
    }),
  ];
}

/** Representative processed body for each kind, shaped like the process module's output. */
const KIND_BODY: Record<Kind, string> = {
  page:
    '<p>Welcome to the course. Read the <a href="https://example.org/handbook">student handbook</a> first.</p>' +
    '<h3>Objectives</h3><ul><li>Understand <strong>stacks</strong> and <em>queues</em></li><li>Write recursive code</li></ul>' +
    '<h4>Details</h4><p class="sg-center">Centred note.</p>' +
    `<figure><img src="${PNG_1PX}" alt="Course banner" width="50%"><figcaption>The course banner</figcaption></figure>`,
  syllabus:
    '<h3>Grading</h3>' +
    '<table><caption>Grade weights</caption><thead><tr><th>Component</th><th>Weight</th></tr></thead>' +
    '<tbody><tr><td>Homework</td><td>40%</td></tr><tr><td>Midterm</td><td>25%</td></tr><tr><td>Final</td><td>35%</td></tr></tbody></table>' +
    '<blockquote><p>Late work loses 10% per day.</p></blockquote>' +
    '<p>Use <code>git</code> for submissions.</p><pre>make test\nmake submit</pre>',
  assignment: '<p class="sg-meta">10 points · Due Sep 14, 2026</p><p>Implement a linked list.</p>',
  discussion: '<p>Introduce yourself.</p><ol><li>Name</li><li>Major</li></ol>',
  announcement: '<p>Office hours move to Tuesdays this week.</p>',
  quiz: '<p>Covers weeks 1–3.</p><p class="sg-meta">12 questions · 24 points</p>',
  link: '<p><a href="https://example.org/reading">Reading: Big-O notation</a></p><p>An introduction.</p>',
  tool: '<p>An external tool. Launch it from the course site.</p>',
  file: `<figure><img src="${PNG_1PX}" alt="Diagram of a binary tree"><figcaption>tree.png</figcaption></figure>`,
  other: '',
};

/** One page per kind, unique titles, realistic bodies (same body for both variants). */
export function everyKindPages(): ProcessedPage[] {
  return (Object.keys(KIND_LABEL) as Kind[]).map((kind, i) =>
    page({
      sectionId: `sec-${kind}`,
      title: `${KIND_LABEL[kind]} ${i + 1}`,
      kind,
      original: KIND_BODY[kind],
      neutral: KIND_BODY[kind],
    }),
  );
}

export function makeDoc(
  presentation: Presentation,
  over: Partial<DocOptions> = {},
  cover: Partial<CoverInfo> = {},
  sections: ProcessedPage[] = threePages(),
): SyllabusDoc {
  return {
    options: { presentation, palette: DEFAULT_PALETTE, showCover: true, showToc: true, pageBreaks: false, language: 'en', ...over },
    cover: {
      courseTitle: 'Fundamentals of Data Structures',
      courseCode: 'ICS 123',
      term: 'Fall 2026',
      instructor: '<b>x</b>',
      email: 'prof@example.edu',
      officeHours: 'Mon 2–4\nWed 1–3',
      meetingTimes: 'TTh 9:00–10:15',
      ...cover,
    },
    sections,
  };
}

export function count(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

export function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

// ---- WCAG 2.x relative luminance and contrast ratio (independent of src) ----
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`bad hex ${hex}`);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Parse "--sg-x: value;" declarations out of a CSS block. */
export function parseVars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--sg-([a-z]+):\s*([^;]+);/gi)) out[m[1]!] = m[2]!.trim().toLowerCase();
  return out;
}
