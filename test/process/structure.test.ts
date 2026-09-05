import { describe, expect, it } from 'vitest';
import { entry, fakePng, run } from './helpers';

describe('other structural fixes (§6d)', () => {
  it('converts consecutive bullet paragraphs into a <ul>', async () => {
    const p = await run('<p>Bring:</p><p>- a pencil</p><p>• paper</p><p>* <strong>your</strong> laptop</p><p>Thanks.</p>');
    expect(p.neutral).toBe('<p>Bring:</p><ul><li>a pencil</li><li>paper</li><li><strong>your</strong> laptop</li></ul><p>Thanks.</p>');
    expect(entry(p, 'fake-list-converted')?.count).toBe(1);
  });

  it('converts consecutive numbered paragraphs into an <ol>, keeping the start', async () => {
    const p = await run('<p>3. third</p><p>4. fourth</p><p>5) fifth</p><p>1. not part</p>');
    expect(p.neutral).toBe('<ol start="3"><li>third</li><li>fourth</li><li>fifth</li></ol><p>1. not part</p>');
    const q = await run('<p>1. one</p><p>2. two</p>');
    expect(q.neutral).toBe('<ol><li>one</li><li>two</li></ol>');
  });

  it('leaves a single marker paragraph alone', async () => {
    const p = await run('<p>- alone</p><p>next</p>');
    expect(p.neutral).toBe('<p>- alone</p><p>next</p>');
  });

  it('promotes an all-bold first row to a header row', async () => {
    const p = await run(
      '<table><tbody><tr><td><strong>Week</strong></td><td><p><b>Topic</b></p></td></tr><tr><td>1</td><td>Intro</td></tr></tbody></table>',
    );
    expect(p.neutral).toBe(
      '<table><thead><tr><th scope="col"><strong>Week</strong></th><th scope="col"><p><strong>Topic</strong></p></th></tr></thead><tbody><tr><td>1</td><td>Intro</td></tr></tbody></table>',
    );
    expect(entry(p, 'table-header-added')?.count).toBe(1);
  });

  it('does not promote a mixed first row and keeps colspan/rowspan', async () => {
    const p = await run(
      '<table><tbody><tr><td><strong>Week</strong></td><td>Topic</td></tr><tr><td colspan="2" rowspan="1">Intro</td></tr></tbody></table>',
    );
    expect(p.neutral).not.toContain('<th');
    expect(p.neutral).toContain('<td colspan="2" rowspan="1">Intro</td>');
    expect(entry(p, 'table-header-added')).toBeUndefined();
  });

  it('unwraps single-cell layout tables', async () => {
    const p = await run('<table width="100%"><tbody><tr><td style="padding: 8px">Just text <b>here</b><p>and a para</p></td></tr></tbody></table>');
    expect(p.neutral).toBe('<p>Just text <strong>here</strong></p><p>and a para</p>');
    expect(entry(p, 'layout-table-unwrapped')?.count).toBe(1);
  });

  it('unwraps role=presentation tables cell by cell', async () => {
    const p = await run('<table role="presentation"><tr><td><p>Left</p></td><td><p>Right</p></td></tr></table>');
    expect(p.neutral).toBe('<p>Left</p><p>Right</p>');
  });

  it('unwraps empty links and links without href, and merges adjacent duplicates', async () => {
    const p = await run(
      '<p><a>no href</a> <a href="">blank</a> <a href="https://a.example/"></a>x <a href="https://a.example/">Foo</a> <a href="https://a.example/">bar</a> <a href="https://b.example/">baz</a></p>',
    );
    expect(p.neutral).toBe('<p>no href blank x <a href="https://a.example/">Foo bar</a> <a href="https://b.example/">baz</a></p>');
    expect(entry(p, 'empty-link-unwrapped')?.count).toBe(3);
    expect(entry(p, 'duplicate-link-merged')?.count).toBe(1);
  });

  it('flags vague link text and bare URLs but keeps the links', async () => {
    const p = await run(
      '<p><a href="https://a.example/">click here</a> <a href="https://a.example/x">Here.</a> <a href="https://a.example/y">this page</a> ' +
        '<a href="https://a.example/z">Link</a> <a href="https://a.example/w">Read more</a> <a href="https://a.example/q">https://a.example/q</a> ' +
        '<a href="https://a.example/good">Course schedule</a></p>',
    );
    const e = entry(p, 'vague-link-text');
    expect(e?.severity).toBe('todo');
    expect(e?.count).toBe(6);
    expect((p.neutral.match(/<a /g) ?? []).length).toBe(7);
  });

  it('handles alt text: missing → todo, filename → decorative, empty on a full-size image → todo, tiny → decorative', async () => {
    const p = await run(
      '<p><img src="$IMS-CC-FILEBASE$/diagram.png"></p>' +
        '<p><img src="$IMS-CC-FILEBASE$/Uploaded%20Media/photo.jpg" alt="photo.jpg"></p>' +
        '<p><img src="$IMS-CC-FILEBASE$/deco.png" alt=""></p>' +
        '<p><img src="$IMS-CC-FILEBASE$/dot.gif" width="10" height="10"></p>' +
        '<p><img src="$IMS-CC-FILEBASE$/tiny.gif" alt=" "></p>',
    );
    expect(entry(p, 'image-missing-alt')?.count).toBe(1);
    expect(entry(p, 'image-missing-alt')?.detail).toBe('diagram.png');
    expect(entry(p, 'filename-alt-cleared')?.count).toBe(1);
    expect(entry(p, 'decorative-image-marked')?.count).toBe(1);
    // alt="" on a 400×300 content image is reported (§9b); on a 1×1 it is decorative and silent
    const empty = entry(p, 'image-empty-alt');
    expect(empty?.severity).toBe('todo');
    expect(empty?.count).toBe(1);
    expect(empty?.detail).toBe('deco.png');
    expect((p.neutral.match(/alt=""/g) ?? []).length).toBe(4);
    expect(p.neutral).toMatch(/<img src="data:image\/png;base64,[^"]+">/);
  });

  it('never blanks the alt of an image that is a link\'s only name; asks for text instead', async () => {
    const p = await run(
      '<p><a href="https://example.com/course"><img src="$IMS-CC-FILEBASE$/logo.png" alt="logo.png"></a></p>' +
        '<p><a href="https://example.com/map"><img src="$IMS-CC-FILEBASE$/map.png" role="presentation" alt="Campus map"></a></p>' +
        '<p><a href="https://example.com/x"><img src="$IMS-CC-FILEBASE$/x.png"></a></p>' +
        '<p><a href="https://example.com/y">Read <img src="$IMS-CC-FILEBASE$/icon.png" alt="icon.png"></a></p>' +
        '<p><a href="https://example.com/z" title="Zed"><img src="$IMS-CC-FILEBASE$/z.png" alt="z.png"></a></p>',
    );
    for (const html of [p.original, p.neutral]) {
      expect(html).toMatch(/<a href="https:\/\/example\.com\/course"><img src="data:[^"]+" alt="logo\.png"><\/a>/);
      expect(html).toMatch(/<a href="https:\/\/example\.com\/map"><img src="data:[^"]+" alt="Campus map"><\/a>/);
      expect(html).toMatch(/<a href="https:\/\/example\.com\/y">Read <img src="data:[^"]+" alt=""><\/a>/);
      expect(html).toMatch(/<a href="https:\/\/example\.com\/z" title="Zed"><img src="data:[^"]+" alt=""><\/a>/);
    }
    const e = entry(p, 'image-link-needs-text');
    expect(e?.severity).toBe('todo');
    expect(e?.count).toBe(2);
    expect(e?.detail).toBe('logo.png; x.png');
    expect(entry(p, 'image-missing-alt')).toBeUndefined();
    expect(entry(p, 'decorative-image-marked')).toBeUndefined();
    expect(entry(p, 'filename-alt-cleared')?.count).toBe(2);
  });

  it('a figure captioned with a filename still needs a description; a described figure is left alone', async () => {
    const p = await run(
      '<figure><img src="$IMS-CC-FILEBASE$/1710240884244.jpg" alt="1710240884244.jpg"><figcaption>1710240884244.jpg</figcaption></figure>' +
        '<figure><img src="$IMS-CC-FILEBASE$/widget-diagram.png" alt="Widget Diagram"><figcaption>Widget Diagram</figcaption></figure>' +
        '<figure><img src="$IMS-CC-FILEBASE$/photo.png" alt=""><figcaption>Figure 1: the widget, assembled</figcaption></figure>',
    );
    expect(p.neutral).toMatch(/<figure><img src="data:[^"]+" alt=""><figcaption>1710240884244\.jpg<\/figcaption><\/figure>/);
    expect(p.neutral).toMatch(/<figure><img src="data:[^"]+" alt="Widget Diagram"><figcaption>Widget Diagram<\/figcaption><\/figure>/);
    expect(p.neutral).toMatch(/<figure><img src="data:[^"]+" alt=""><figcaption>Figure 1: the widget, assembled<\/figcaption><\/figure>/);
    const e = entry(p, 'image-missing-alt');
    expect(e?.count).toBe(1);
    expect(e?.detail).toBe('1710240884244.jpg');
    expect(entry(p, 'filename-alt-cleared')).toBeUndefined();
    expect(entry(p, 'image-empty-alt')).toBeUndefined();
  });

  it('demotes a heading left with only a decorative image to a paragraph, before anchors are assigned', async () => {
    const p = await run('<h2><img src="$IMS-CC-FILEBASE$/banner.png" alt="banner.png"></h2><p>Body</p><h3>Sub</h3>');
    expect(p.neutral).toMatch(/^<p><img src="data:[^"]+" alt=""><\/p><p>Body<\/p><h3 id="sec-1-h1">Sub<\/h3>$/);
    expect(entry(p, 'empty-heading-demoted')?.count).toBe(1);
    expect(entry(p, 'filename-alt-cleared')?.count).toBe(1);
    // a heading whose image is described keeps its place in the outline
    const q = await run('<h2><img src="$IMS-CC-FILEBASE$/logo.png" alt="Course logo"></h2><p>x</p>');
    expect(q.neutral).toMatch(/^<h3 id="sec-1-h1"><img src="data:[^"]+" alt="Course logo"><\/h3><p>x<\/p>$/);
    expect(entry(q, 'empty-heading-demoted')).toBeUndefined();
  });

  it('repairs list markup: nested lists move into the item before them, stray children and orphan items get wrapped', async () => {
    const p = await run(
      '<ul><li>a</li><ul><li>b</li></ul></ul><p>x</p><li>orphan 1</li><li>orphan 2</li><p>y</p><ol>stray text<li>one</li><p>para</p></ol>',
    );
    expect(p.neutral).toBe(
      '<ul><li>a<ul><li>b</li></ul></li></ul><p>x</p><ul><li>orphan 1</li><li>orphan 2</li></ul><p>y</p><ol><li>stray text</li><li>one</li><li><p>para</p></li></ol>',
    );
    expect(entry(p, 'list-markup-fixed')?.count).toBe(3);
    const q = await run('<ul><li>fine</li><li>also fine<ul><li>nested fine</li></ul></li></ul>');
    expect(entry(q, 'list-markup-fixed')).toBeUndefined();
  });

  it('repoints headers="" references to ids that survive both variants and drops dangling ones', async () => {
    const p = await run(
      '<table><tr><th id="c1">Week</th><th id="c2">Topic</th></tr><tr><td headers="c1">1</td><td headers="c2 nope">Intro</td><td headers="nope">?</td></tr></table>',
      { sectionId: 'sec-9' },
    );
    for (const html of [p.original, p.neutral]) {
      expect(html).toContain('<th id="sec-9-t1-c1">Week</th><th id="sec-9-t1-c2">Topic</th>');
      expect(html).toContain('<td headers="sec-9-t1-c1">1</td><td headers="sec-9-t1-c2">Intro</td><td>?</td>');
      expect(html).not.toMatch(/id="c[12]"|headers="[^"]*nope/);
    }
    expect(entry(p, 'table-headers-fixed')?.count).toBe(1);
  });

  it('removes lang attributes that are not language tags and keeps valid ones', async () => {
    const p = await run('<p lang="not a tag">Bonjour</p><p lang="fr-CA">Bonjour</p><p lang=" en ">Hi</p><p lang="">x</p>');
    for (const html of [p.original, p.neutral]) {
      expect(html).toBe('<p>Bonjour</p><p lang="fr-CA">Bonjour</p><p lang="en">Hi</p><p>x</p>');
    }
    expect(entry(p, 'invalid-lang-removed')?.count).toBe(2);
  });

  it('does not flag the links it creates for removed embeds as vague', async () => {
    const p = await run('<p><iframe src="https://www.youtube.com/embed/abc123def"></iframe></p>');
    expect(p.neutral).toContain('<p class="sg-embed">Embedded content: <a href="https://www.youtube.com/watch?v=abc123def">www.youtube.com</a></p>');
    expect(entry(p, 'interactive-removed')?.count).toBe(1);
    expect(entry(p, 'vague-link-text')).toBeUndefined();
  });

  it('flags images that appear to contain text (size/aspect or filename hint)', async () => {
    const p = await run(
      '<p><img src="$IMS-CC-FILEBASE$/wide-banner.png" alt="Wide"></p>' +
        '<p><img src="$IMS-CC-FILEBASE$/Screen%20Shot%202021-01-27.png" alt="Screenshot of the tool" width="200" height="200"></p>' +
        '<p><img src="$IMS-CC-FILEBASE$/small.png" alt="Small" width="300" height="100"></p>' +
        '<p>Inline <img src="$IMS-CC-FILEBASE$/wide-inline.png" alt="Inline wide" width="800" height="200"> text</p>',
    );
    const e = entry(p, 'image-may-contain-text');
    expect(e?.severity).toBe('todo');
    expect(e?.count).toBe(2);
    expect(e?.detail).toBe('wide-banner.png; Screen Shot 2021-01-27.png');
  });

  it('removes empty paragraphs, empty spans and divs', async () => {
    const p = await run('<p>&nbsp;</p><p> </p><p><br></p><p>Real<span></span> text<span> </span>here</p><div></div><div><span>&nbsp;</span></div>');
    expect(p.neutral).toBe('<p>Real text here</p>');
    expect(p.original).toBe('<p>Real text here</p>');
    expect(entry(p, 'empty-paragraph-removed')?.count).toBe(3);
  });

  it('reports low contrast in Original against the white page and default text when one side is undeclared', async () => {
    const p = await run(
      '<p style="color: #777; background-color: #999">hard to read</p>' +
        '<p style="color: #ffffff; background-color: #003764">fine</p>' +
        '<p style="color: #ffff00">yellow on the white page</p>' +
        '<p style="background-color: #222222;">dark band with default black text</p>' +
        '<div style="background: #000"><p style="color: #111">nested dark</p></div>' +
        '<h2 style="color: #767676; background-color: #ffffff; font-size: 24pt">large text passes at 3:1</h2>' +
        '<p><font color="#dddddd">light font tag</font></p>' +
        '<table><tr><td bgcolor="#333333">default text on a dark cell</td></tr><tr><td>x</td></tr></table>' +
        '<p style="color: var(--brand)">an unknown declared color is skipped, not guessed</p>' +
        '<p style="color: #003764">navy on the page is fine</p>',
    );
    const e = entry(p, 'low-contrast');
    expect(e?.severity).toBe('todo');
    expect(e?.count).toBe(6);
    expect(e?.detail).toContain('#ffff00 on the page (1.1:1)');
    expect(e?.detail).toContain('default text on #222222 (1.3:1)');
    expect(e?.detail).toContain('#dddddd on the page');
    expect(p.notices).toContain('low-contrast');
    const q = await run('<p style="color: #ffffff; background-color: #003764">fine</p><p style="color: var(--x)">skip</p>');
    expect(entry(q, 'low-contrast')).toBeUndefined();
    expect(q.notices).not.toContain('low-contrast');
  });

  it('unwraps landmarks and details inside a page', async () => {
    const p = await run('<section><header><h2>T</h2></header><details><summary>More</summary><p>hidden by default</p></details></section>');
    // the summary becomes a bold paragraph, which the fake-heading rule then promotes
    expect(p.neutral).toBe('<h3 id="sec-1-h1">T</h3><h4 id="sec-1-h2">More</h4><p>hidden by default</p>');
  });

  it('keeps a wide intrinsic image out of the text heuristic when not alone', async () => {
    const p = await run(`<p>Look <img src="${fakePng(1000, 300)}" alt="Chart"> here</p>`);
    expect(entry(p, 'image-may-contain-text')).toBeUndefined();
    expect(p.assetBytes).toBeGreaterThan(0);
  });
});

describe('email links', () => {
  it('flags an email link whose visible address differs from its target', async () => {
    const p = await run('<p>Email <a href="mailto:other@example.edu">me@example.edu</a></p>');
    const e = entry(p, 'link-email-mismatch');
    expect(e?.severity).toBe('todo');
    expect(e?.count).toBe(1);
    expect(p.neutral).toContain('href="mailto:other@example.edu"');
  });
  it('does not flag a matching email link or a non-email link text', async () => {
    const p = await run('<p><a href="mailto:me@example.edu">me@example.edu</a> or <a href="mailto:me@example.edu">write to me</a></p>');
    expect(entry(p, 'link-email-mismatch')).toBeUndefined();
  });
});
