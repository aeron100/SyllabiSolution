import { describe, expect, it } from 'vitest';
import { run } from './helpers';

const PAGE =
  '<h2 style="background-color: #003764; color: #ffffff;">Welcome</h2>' +
  '<p>Read the <a href="$WIKI_REFERENCE$/pages/materials">materials</a> and <a href="https://x.instructure.com/courses/1/pages/a">this</a>.</p>' +
  '<p>&nbsp;</p><p><strong>Deliverables</strong></p><p>- one</p><p>- two</p>' +
  '<p><img src="$IMS-CC-FILEBASE$/Uploaded%20Media/Screen%20Shot.png" alt="" role="presentation" width="800" height="300"></p>' +
  '<div><iframe src="https://www.youtube.com/embed/abcdefghijk?si=1"></iframe></div>' +
  '<table><tr><td><b>A</b></td><td><b>B</b></td></tr><tr><td>1</td><td>2</td></tr></table>' +
  '<p style="color: #999; background-color: #aaa">low</p>';

describe('determinism', () => {
  it('produces byte-identical output and reports for the same input', async () => {
    const a = await run(PAGE, { selectedSections: new Map([['res-materials', 'sec-m']]), resolveWikiRef: () => 'res-materials' });
    const b = await run(PAGE, { selectedSections: new Map([['res-materials', 'sec-m']]), resolveWikiRef: () => 'res-materials' });
    expect(a.original).toBe(b.original);
    expect(a.neutral).toBe(b.neutral);
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
    expect(a.notices).toEqual(b.notices);
    expect(a.assetBytes).toBe(b.assetBytes);
    expect(a.original).not.toBe(a.neutral);
    expect(a.report.length).toBeGreaterThan(5);
  });

  it('report entries carry the section and plain-language messages', async () => {
    const p = await run(PAGE, { sectionId: 'sec-42', sectionTitle: 'Week 1' });
    for (const e of p.report) {
      expect(e.sectionId).toBe('sec-42');
      expect(e.sectionTitle).toBe('Week 1');
      expect(e.message).toMatch(/^[A-Z0-9].*\.$/);
      expect(['fixed', 'todo', 'info']).toContain(e.severity);
      expect(e.count).toBeGreaterThan(0);
    }
  });
});
