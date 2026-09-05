import { describe, expect, it } from 'vitest';
import { entry, run } from './helpers';

describe('heading normalization (§6d)', () => {
  it('shifts the highest level used to h3 and keeps relative structure', async () => {
    const p = await run('<h1>Intro</h1><p>a</p><h2>Part</h2><p>b</p><h3>Sub</h3><p>c</p><h2>Part 2</h2>');
    expect(p.neutral).toBe(
      '<h3 id="sec-1-h1">Intro</h3><p>a</p><h4 id="sec-1-h2">Part</h4><p>b</p><h5 id="sec-1-h3">Sub</h5><p>c</p><h4 id="sec-1-h4">Part 2</h4>',
    );
    expect(entry(p, 'heading-normalized')?.count).toBe(4);
  });

  it('closes skipped levels', async () => {
    const p = await run('<h3>Top</h3><p>a</p><h5>Deep</h5><p>b</p><h6>Deeper</h6><p>c</p><h5>Deep 2</h5>');
    expect(p.neutral).toMatch(/<h3 id="sec-1-h1">Top<\/h3>.*<h4 id="sec-1-h2">Deep<\/h4>.*<h5 id="sec-1-h3">Deeper<\/h5>.*<h4 id="sec-1-h4">Deep 2<\/h4>/);
    expect(entry(p, 'heading-normalized')?.count).toBe(3);
  });

  it('clamps anything past h6 into a bold lead-in paragraph', async () => {
    const p = await run('<h1>1</h1><h2>2</h2><h3>3</h3><h4>4</h4><h5>5</h5><h6>6</h6><p>text</p>');
    expect(p.neutral).toContain('<h6 id="sec-1-h4">4</h6>');
    expect(p.neutral).toContain('<p><strong>5</strong></p>');
    expect(p.neutral).toContain('<p><strong>6</strong></p>');
    expect(p.neutral).not.toMatch(/<h[7-9]/);
    expect(entry(p, 'heading-clamped')?.count).toBe(2);
  });

  it('drops a first heading equal to the section title (case-insensitive)', async () => {
    const p = await run('<h2>  m01 - TASK list </h2><p>a</p><h2>Welcome</h2>', { sectionTitle: 'M01 - Task List' });
    expect(p.neutral).toBe('<p>a</p><h3 id="sec-1-h1">Welcome</h3>');
    expect(entry(p, 'redundant-title-removed')).toBeDefined();
  });

  it('gives every heading a deterministic id', async () => {
    const p = await run('<h2 id="a">A</h2><h2 class="x">B</h2>', { sectionId: 'sec-xyz' });
    expect(p.neutral).toBe('<h3 id="sec-xyz-h1">A</h3><h3 id="sec-xyz-h2">B</h3>');
    expect(p.original).toBe('<h3 id="sec-xyz-h1">A</h3><h3 id="sec-xyz-h2">B</h3>');
  });
});

describe('fake heading promotion (§6d)', () => {
  it('promotes a short, entirely bold paragraph one level below the heading above it', async () => {
    const p = await run('<h2>Policies</h2><p>text</p><p><strong>Late Work</strong></p><p>more</p>');
    expect(p.neutral).toContain('<h4 id="sec-1-h2">Late Work</h4>');
    expect(p.neutral).not.toContain('<strong>Late Work');
    expect(entry(p, 'fake-heading-promoted')?.count).toBe(1);
  });

  it('promotes bold + underline, all caps, and larger font-size paragraphs', async () => {
    const p = await run(
      '<h2>Top</h2><p>intro</p>' +
        '<p><strong><u>Bold and underlined</u></strong></p>' +
        '<p>GRADING SCALE</p>' +
        '<p><span style="font-size: 18pt;">Big words</span></p>' +
        '<p><span style="font-size: 12pt;">Normal words at twelve point are body text here</span></p>',
    );
    expect(p.neutral).toContain('<h4 id="sec-1-h2"><u>Bold and underlined</u></h4>');
    expect(p.neutral).toContain('<h4 id="sec-1-h3">GRADING SCALE</h4>');
    expect(p.neutral).toContain('<h4 id="sec-1-h4">Big words</h4>');
    expect(p.neutral).toContain('<p>Normal words');
    expect(entry(p, 'fake-heading-promoted')?.count).toBe(3);
  });

  it('carries the paragraph style onto the new heading in Original', async () => {
    const p = await run('<h2>Top</h2><p style="color: #003764; text-align: center;"><strong>Office Hours</strong></p>');
    expect(p.original).toContain('<h4 style="color: #003764; text-align: center;" id="sec-1-h2">Office Hours</h4>');
    expect(p.neutral).toContain('<h4 id="sec-1-h2" class="sg-center">Office Hours</h4>');
  });

  it('does not promote long, punctuated, mixed, listed, or tabled paragraphs, or on pages without headings', async () => {
    const long = 'x'.repeat(90);
    const p = await run(
      `<h2>Top</h2><p><strong>${long}</strong></p><p><strong>Ends with period.</strong></p><p><strong>Note:</strong> mixed</p>` +
        '<ul><li><p><strong>In list</strong></p></li></ul><table><tr><td><p><strong>In cell</strong></p></td></tr><tr><td>x</td></tr></table>' +
        '<p><strong><a href="https://a.example/">Bold link</a></strong></p>',
    );
    expect(p.neutral).not.toMatch(/<h[3-6][^>]*>(?:xxxx|Ends|Note|In list|In cell|<a)/);
    expect(entry(p, 'fake-heading-promoted')).toBeUndefined();

    const q = await run('<p>text</p><p><strong>Bold alone</strong></p>');
    expect(q.neutral).toBe('<p>text</p><p><strong>Bold alone</strong></p>');
  });

  it('does not promote a bold paragraph that is two sentences, even without a terminal period', async () => {
    const p = await run(
      '<h2>Top</h2><p><strong>The FINAL EXAM will cover material from Modules 05-08. Study hard!</strong></p>' +
        '<p><strong>Why? Because it matters</strong></p><p><strong>Questions?</strong></p>',
    );
    expect(p.neutral).toContain('<p><strong>The FINAL EXAM will cover material from Modules 05-08. Study hard!</strong></p>');
    expect(p.neutral).toContain('<p><strong>Why? Because it matters</strong></p>');
    expect(p.neutral).toContain('<h4 id="sec-1-h2">Questions?</h4>');
    expect(entry(p, 'fake-heading-promoted')?.count).toBe(1);
  });

  it('a bold paragraph before any heading is promoted and normalized with the rest', async () => {
    const p = await run('<p><strong>Preface</strong></p><h2>Chapter</h2><p>x</p>');
    // promoted to h3 (page top level + 1); as the first heading it then becomes the top level
    expect(p.neutral).toContain('<h3 id="sec-1-h1">Preface</h3>');
    expect(p.neutral).toContain('<h3 id="sec-1-h2">Chapter</h3>');
  });
});
