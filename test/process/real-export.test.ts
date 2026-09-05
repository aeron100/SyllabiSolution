import { existsSync, readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { codes, entry, run } from './helpers';

const FILE = '/Users/tqtran/Documents/SyllabusGenerator/ics123-24142-onl-fund-data-structures-export.imscc';
const M01 = 'wiki_content/m01-task-list.html';
const M02 = 'wiki_content/m02-reading-chapter-2-array-based-lists.html';

describe.skipIf(!existsSync(FILE))('real Canvas export', () => {
  let m01 = '';
  let m02 = '';

  beforeAll(() => {
    const buf = readFileSync(FILE);
    const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const out = unzipSync(data, { filter: (f) => f.name === M01 || f.name === M02 });
    m01 = strFromU8(out[M01]);
    m02 = strFromU8(out[M02]);
    expect(m01.length).toBeGreaterThan(1000);
    expect(m02.length).toBeGreaterThan(1000);
  });

  it('processes m01-task-list.html with nothing else selected', async () => {
    const p = await run(m01, { sectionId: 'sec-m01', sectionTitle: 'M01 - Task List' });
    expect(p.neutral).not.toMatch(/ style=/);
    expect(p.neutral).toContain('<h3 id="sec-m01-h1">Welcome</h3>');
    expect(p.original).toContain('<h3 style="background-color: #003764; color: #ffffff;" id="sec-m01-h1">Welcome</h3>');
    for (const html of [p.original, p.neutral]) {
      expect(html).not.toMatch(/\$CANVAS|\$WIKI|data-|href="#|instructure\.com|OQAFRG994847639|learnobj|display: none|<i>|&nbsp;<\/p>/);
      expect(html).toContain('Course Orientation');
      expect(html).toContain('*Student Learning Contract');
      expect(html).toMatch(/<ol>\s*<li>After reviewing the Course Orientation/);
    }
    expect(p.report.length).toBeGreaterThan(0);
    expect(entry(p, 'internal-link-unwrapped')?.count).toBe(8);
    expect(entry(p, 'empty-paragraph-removed')?.count).toBe(4);
    expect(entry(p, 'hidden-content-removed')?.count).toBe(1);
    expect(entry(p, 'heading-normalized')?.count).toBe(5);
    expect(codes(p, 'todo')).toEqual([]);
    expect(p.notices).toEqual([]);
  });

  it('anchors m01 references when their targets are selected', async () => {
    const p = await run(m01, {
      sectionId: 'sec-m01',
      sectionTitle: 'M01 - Task List',
      selectedSections: new Map([
        ['gb7c761b4ec9475534d68ccc92ca75c64', 'sec-quiz'],
        ['g0fda6cc255874c1cab5257887ab957ce', 'sec-disc'],
        ['g2ec9acea76dc958987d943c60fc31714', 'sec-a1'],
        ['gfa5c1ee70c5ec9ca6b32df39d2d44f9a', 'sec-materials'],
      ]),
      resolveWikiRef: (ref) => (ref === 'gfa5c1ee70c5ec9ca6b32df39d2d44f9a' ? ref : null),
    });
    // attribute order is the source order (title came first on these links)
    expect(p.neutral).toContain('<a title="*Student Learning Contract (Remotely Proctored)" href="#sec-quiz">*Student Learning Contract</a>');
    expect(p.neutral).toContain('<a title="M01 - Discussion: Introductions &amp; ICS" href="#sec-disc">M01 - Discussion: Introductions &amp; ICS</a>');
    expect(p.neutral).toContain('<a title="M01 - Assignment 1: Setup Eclipse" href="#sec-a1">M01 - Assignment 1: Set up Eclipse</a>');
    expect(p.neutral).toContain('href="#sec-materials"');
    expect(p.neutral).not.toMatch(/\$CANVAS|\$WIKI/);
    expect(entry(p, 'internal-link-anchored')?.count).toBe(4);
    expect(entry(p, 'internal-link-unwrapped')?.count).toBe(4);
  });

  it('turns the YouTube iframes and file links on m02 into links and text', async () => {
    const p = await run(m02, { sectionId: 'sec-m02', sectionTitle: 'M02 - Reading: Chapter 2 - Array-Based Lists' });
    expect(p.neutral).toContain('<p class="sg-embed">Embedded content: <a href="https://www.youtube.com/watch?v=_Wf2rbL9wQU">www.youtube.com</a></p>');
    expect(p.neutral).toContain('<a href="https://www.youtube.com/watch?v=xk4_1vDrzzo&amp;t=5908">www.youtube.com</a>');
    expect(p.neutral).toContain('<a href="https://www.youtube.com/watch?v=eIrMbAQSU34&amp;t=1522">www.youtube.com</a>');
    expect(p.neutral).not.toMatch(/<iframe|\$IMS-CC-FILEBASE\$|dp-wrapper| style=/);
    expect(p.neutral).toContain('Open Data Structures (file: OpenDataStructures.pdf) will be used');
    expect(p.neutral).toContain('<p>Open Data Structures Chapter 2.pdf</p>');
    expect(p.neutral).toContain('<a href="https://www.w3schools.com/java/java_arrays.asp">W3Schools: Java Arrays</a>');
    expect(p.neutral).toMatch(/<img src="data:image\/png;base64,[^"]+" alt="">/);
    expect(p.neutral).toContain('<h3 id="sec-m02-h1">Textbook Readings</h3>');
    expect(p.notices).toEqual(['interactive-removed']);
    expect(entry(p, 'interactive-removed')?.count).toBe(3);
    expect(entry(p, 'file-link-unwrapped')?.count).toBe(2);
    expect(p.assetBytes).toBeGreaterThan(0);
  });

  it('is deterministic on a real page', async () => {
    const a = await run(m02, { sectionId: 'sec-m02', sectionTitle: 'M02' });
    const b = await run(m02, { sectionId: 'sec-m02', sectionTitle: 'M02' });
    expect(a.original).toBe(b.original);
    expect(a.neutral).toBe(b.neutral);
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
  });
});
