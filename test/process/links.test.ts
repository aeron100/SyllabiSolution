import { describe, expect, it } from 'vitest';
import { codes, entry, run, TINY_PNG } from './helpers';

describe('assets and links (§6c)', () => {
  it('embeds $IMS-CC-FILEBASE$ images (and encoded/underscore variants) as data URIs', async () => {
    const seen: string[] = [];
    const p = await run(
      '<p><img src="$IMS-CC-FILEBASE$/Uploaded%20Media/Canvas-Logo.png" alt="Canvas logo"></p>' +
        '<p><img src="%24IMS-CC-FILEBASE%24/a.png" alt="A"></p>' +
        '<p><img src="$IMS_CC_FILEBASE$/b.png" alt="B"></p>' +
        '<p><img src="images/rel.png" alt="R"></p>',
      {
        resolveAsset: async (href) => {
          seen.push(href);
          return { dataUri: TINY_PNG, bytes: 68, mime: 'image/png' };
        },
      },
    );
    expect(seen).toEqual([
      '$IMS-CC-FILEBASE$/Uploaded%20Media/Canvas-Logo.png',
      '$IMS-CC-FILEBASE$/a.png',
      '$IMS-CC-FILEBASE$/b.png',
      'images/rel.png',
    ]);
    expect((p.neutral.match(/src="data:image\/png;base64,/g) ?? []).length).toBe(4);
    expect(p.assetBytes).toBe(4 * 68);
    expect(p.neutral).toContain('alt="Canvas logo"');
  });

  it('unwraps file links to text plus the filename, without embedding', async () => {
    const p = await run(
      '<p>Read <a href="$IMS-CC-FILEBASE$/Textbook/Open%20Data%20Structures.pdf?canvas_=1&amp;canvas_qs_wrap=1">the book</a> first.</p>' +
        '<p><a href="$IMS-CC-FILEBASE$/Textbook/Chapter%202.pdf">Chapter 2.pdf</a></p>' +
        '<p><a href="docs/notes.docx">Notes</a></p>',
    );
    expect(p.neutral).toContain('<p>Read the book (file: Open Data Structures.pdf) first.</p>');
    expect(p.neutral).toContain('<p>Chapter 2.pdf</p>');
    expect(p.neutral).toContain('<p>Notes (file: notes.docx)</p>');
    expect(p.neutral).not.toContain('<a');
    expect(p.neutral).not.toContain('application/pdf');
    const e = entry(p, 'file-link-unwrapped');
    expect(e?.severity).toBe('info');
    expect(e?.count).toBe(3);
  });

  it('turns $WIKI_REFERENCE$ into an anchor when selected, text otherwise', async () => {
    const html =
      '<p><a href="$WIKI_REFERENCE$/pages/course-materials">Materials</a> and <a href="$WIKI_REFERENCE$/pages/gabc123">By id</a> and <a href="$WIKI_REFERENCE$/pages/unknown-page">Nope</a></p>';
    const p = await run(html, {
      selectedSections: new Map([
        ['res-materials', 'sec-materials'],
        ['gabc123', 'sec-abc'],
      ]),
      resolveWikiRef: (ref) => (ref === 'course-materials' ? 'res-materials' : null),
    });
    expect(p.neutral).toContain('<a href="#sec-materials">Materials</a>');
    expect(p.neutral).toContain('<a href="#sec-abc">By id</a>');
    expect(p.neutral).toContain(' and Nope</p>');
    expect(entry(p, 'internal-link-anchored')?.count).toBe(2);
    expect(entry(p, 'internal-link-unwrapped')?.count).toBe(1);
  });

  it('handles $CANVAS_OBJECT_REFERENCE$ and $CANVAS_COURSE_REFERENCE$', async () => {
    const html =
      '<ul><li><a href="$CANVAS_OBJECT_REFERENCE$/assignments/ga1">Assignment 1</a></li>' +
      '<li><a href="$CANVAS_OBJECT_REFERENCE$/discussion_topics/gd1">Discussion</a></li>' +
      '<li><a href="$CANVAS_OBJECT_REFERENCE$/quizzes/gq1">Quiz</a></li>' +
      '<li><a href="$CANVAS_OBJECT_REFERENCE$/quizzes/gq2">Quiz 2</a></li>' +
      '<li><a href="$CANVAS_OBJECT_REFERENCE$/modules/gm1">Module</a></li>' +
      '<li><a href="$CANVAS_COURSE_REFERENCE$/modules">All modules</a></li></ul>';
    const p = await run(html, {
      selectedSections: new Map([
        ['ga1', 'sec-a1'],
        ['gd1', 'sec-d1'],
        ['gq1', 'sec-q1'],
      ]),
    });
    expect(p.neutral).toContain('<a href="#sec-a1">Assignment 1</a>');
    expect(p.neutral).toContain('<a href="#sec-d1">Discussion</a>');
    expect(p.neutral).toContain('<a href="#sec-q1">Quiz</a>');
    expect(p.neutral).toContain('<li>Quiz 2</li>');
    expect(p.neutral).toContain('<li>Module</li>');
    expect(p.neutral).toContain('<li>All modules</li>');
    expect(p.neutral).not.toContain('$CANVAS');
  });

  it('unwraps links back to the LMS and keeps other web links with only href/title', async () => {
    const p = await run(
      '<p><a class="external" href="https://coastdistrict.instructure.com/courses/133175/files/1" target="_blank" rel="noopener">LMS file</a>, ' +
        '<a href="https://myschool.edu/courses/42/pages/x">LMS page</a>, ' +
        '<a href="/courses/42/pages/x">root path</a>, ' +
        '<a href="https://www.w3schools.com/java/" title="W3" target="_blank" data-x="1">W3Schools</a>, ' +
        '<a href="mailto:a@b.edu">mail</a></p>',
    );
    expect(p.neutral).toContain('LMS file, LMS page, root path, ');
    expect(p.neutral).toContain('<a href="https://www.w3schools.com/java/" title="W3">W3Schools</a>');
    expect(p.neutral).toContain('<a href="mailto:a@b.edu">mail</a>');
    expect(p.neutral).not.toMatch(/target=|rel=|class="external"/);
    expect(entry(p, 'lms-link-unwrapped')?.count).toBe(3);
  });

  it('unwraps LMS-shaped links on a vanity domain, and learns that domain for its other links', async () => {
    const p = await run(
      '<p><a href="https://canvas.school.edu/files/123/download?download_frd=1">Reading</a> and ' +
        '<a href="https://canvas.school.edu/about">About</a> and ' +
        '<a href="https://other.example/files/9/download">Other</a> and ' +
        '<a href="https://www.example.org/files-guide">Kept</a></p>',
    );
    expect(p.neutral).toBe('<p>Reading and About and Other and <a href="https://www.example.org/files-guide">Kept</a></p>');
    const e = entry(p, 'lms-link-unwrapped');
    expect(e?.severity).toBe('info');
    expect(e?.count).toBe(3);
  });

  it('learns the LMS host from Canvas data-api-endpoint attributes before they are stripped', async () => {
    const p = await run(
      '<p><img src="$IMS-CC-FILEBASE$/a.png" alt="Alpha diagram" data-api-endpoint="https://canvas.school.edu/api/v1/courses/1/files/2" data-api-returntype="File"> ' +
        '<a href="https://canvas.school.edu/calendar">Cal</a> <a href="https://canvas.school.edu/some/page">Page</a> ' +
        '<a href="https://www.example.org/">Kept</a></p>',
    );
    expect(p.neutral).toMatch(/^<p><img src="data:[^"]+" alt="Alpha diagram"> Cal Page <a href="https:\/\/www\.example\.org\/">Kept<\/a><\/p>$/);
    expect(p.neutral).not.toContain('data-api');
    expect(entry(p, 'lms-link-unwrapped')?.count).toBe(2);
  });

  it('replaces external images with their alt text and reports them', async () => {
    const p = await run(
      '<p><img src="https://cdn.example/pic.png" alt="A chart of grades" width="300"></p><p><img src="//cdn.example/deco.gif" alt=""></p>',
    );
    expect(p.neutral).toContain('<span class="sg-missing-image">Image not available: A chart of grades</span>');
    expect(p.neutral).not.toContain('cdn.example');
    expect(p.neutral).not.toContain('<img');
    expect(p.notices).toContain('external-images');
    const e = entry(p, 'external-image');
    expect(e?.severity).toBe('todo');
    expect(e?.count).toBe(2);
  });

  it('replaces images not in the export the same way, with the missing-files notice', async () => {
    const p = await run('<p><img src="$IMS-CC-FILEBASE$/gone/missing.png" alt="Old diagram"></p>');
    expect(p.neutral).toContain('<span class="sg-missing-image">Image not available: Old diagram</span>');
    expect(p.notices).toContain('missing-files');
    expect(p.notices).not.toContain('external-images');
    expect(entry(p, 'missing-image')?.severity).toBe('todo');
  });

  it('turns Canvas equation images into inline code', async () => {
    const p = await run(
      '<p>Solve <img class="equation_image" title="x^2" src="https://canvas.example/equation_images/x%255E2" alt="x^2" data-equation-content="x^2 + 1"> now,' +
        ' and <img src="/equation_images/%5Cfrac%7Ba%7D%7Bb%7D" alt="LaTeX: \\frac{a}{b}"></p>',
    );
    expect(p.neutral).toContain('Solve <code class="sg-equation">x^2 + 1</code> now,');
    expect(p.neutral).toContain('<code class="sg-equation">LaTeX: \\frac{a}{b}</code>');
    expect(p.original).toContain('<code class="sg-equation">x^2 + 1</code>');
    expect(p.notices).toContain('equations');
    expect(entry(p, 'equation-image')?.count).toBe(2);
    expect(codes(p, 'todo')).toContain('equation-image');
  });

  it('repoints in-page anchors to new heading ids and unwraps dead ones', async () => {
    const p = await run(
      '<p><a href="#grading">Grading</a> <a href="#nowhere">Nowhere</a> <a href="#">Top</a></p><h2 id="grading">Grading</h2><p>x</p>',
    );
    expect(p.neutral).toContain('<a href="#sec-1-h1">Grading</a>');
    expect(p.neutral).toContain('<h3 id="sec-1-h1">Grading</h3>');
    expect(p.neutral).toContain(' Nowhere Top</p>');
    expect(entry(p, 'anchor-link-rewritten')?.count).toBe(1);
    expect(entry(p, 'anchor-link-unwrapped')?.count).toBe(2);
  });
});
