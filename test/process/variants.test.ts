import { describe, expect, it } from 'vitest';
import { run } from './helpers';

describe('presentation variants (§6e)', () => {
  it('neutral translates meaning-carrying styles then strips everything', async () => {
    const p = await run(
      '<p style="text-align: center;"><span style="font-weight: bold;">Bold</span> <span style="font-style: italic">It</span> ' +
        '<span style="text-decoration: underline;">Under</span> <span style="text-decoration: line-through">Gone</span> ' +
        '<span style="font-weight: 700; font-style: italic">Both</span> <font color="red" face="Arial">font</font></p>' +
        '<p align="right">Right</p><div align="center">Centered div</div><center>Old center</center>' +
        '<table width="100%" border="1" cellpadding="4"><tbody><tr><td width="50%" style="color: red" valign="top">a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>' +
        '<h2 style="font-weight: bold; background-color: #003764; color: #ffffff;">Heading</h2>',
    );
    expect(p.neutral).toBe(
      '<p class="sg-center"><strong>Bold</strong> <em>It</em> <u>Under</u> <s>Gone</s> <strong><em>Both</em></strong> font</p>' +
        '<p class="sg-right">Right</p><p class="sg-center">Centered div</p><p class="sg-center">Old center</p>' +
        '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>' +
        '<h3 id="sec-1-h1">Heading</h3>',
    );
    expect(p.neutral).not.toMatch(/style=|class="(?!sg-)|width=|height=|<font|<center|border=|cellpadding|valign|align=/);
  });

  it('neutral maps b/i/strike to strong/em/s and keeps u, s, sup, sub, code, pre', async () => {
    const p = await run('<p><b>b</b> <i>i</i> <strike>st</strike> <u>u</u> <s>s</s> x<sup>2</sup> H<sub>2</sub>O <code>c</code></p><pre>  pre  </pre>');
    expect(p.neutral).toBe('<p><strong>b</strong> <em>i</em> <s>st</s> <u>u</u> <s>s</s> x<sup>2</sup> H<sub>2</sub>O <code>c</code></p><pre>  pre  </pre>');
  });

  it('neutral turns pixel image widths into a capped percentage of the content width', async () => {
    const p = await run(
      '<p><img src="$IMS-CC-FILEBASE$/a.png" alt="Alpha" width="350" height="200"></p>' +
        '<p><img src="$IMS-CC-FILEBASE$/b.png" alt="Bravo" width="1400"></p>' +
        '<p><img src="$IMS-CC-FILEBASE$/c.png" alt="Charlie" style="width: 175px; height: 90px"></p>' +
        '<p><img src="$IMS-CC-FILEBASE$/d.png" alt="Delta" width="100%" height="100%"></p>' +
        '<p><img src="$IMS-CC-FILEBASE$/e.png" alt="Echo"></p>',
    );
    // The share travels as a percentage width attribute, never as an inline style (DESIGN.md §6e).
    const imgs = p.neutral.match(/<img [^>]+>/g) ?? [];
    expect(imgs[0]).toMatch(/^<img src="data:image\/png;base64,[^"]+" alt="Alpha" width="50%">$/);
    expect(imgs[1]).toContain('width="100%"');
    expect(imgs[2]).toContain('width="25%"');
    expect(imgs[3]).toContain('width="100%"');
    expect(imgs[4]).not.toMatch(/width=|style=/);
    expect(p.neutral).not.toMatch(/style=|height="|width="\d+"/);
    // Original keeps the pixel attributes
    expect(p.original).toContain('width="350" height="200"');
  });

  it('original keeps style, width/height, font and align but strips class/id/data-*/role', async () => {
    const p = await run(
      '<p id="intro" class="dp-lead" data-x="1" style="color: #003764; font-size: 14pt;">Lead <span class="x">plain span</span> <span style="color: red">red</span></p>' +
        '<font color="blue">blue</font><div id="wrap" class="dp-wrapper"><p align="center" width="10">c</p></div>' +
        '<h2 class="hd" style="background-color: #003764; color: #ffffff;">H</h2>',
    );
    expect(p.original).toBe(
      '<p style="color: #003764; font-size: 14pt;">Lead plain span <span style="color: red">red</span></p>' +
        '<font color="blue">blue</font><p align="center" width="10">c</p>' +
        '<h3 style="background-color: #003764; color: #ffffff;" id="sec-1-h1">H</h3>',
    );
  });

  it('both variants unwrap attribute-less divs into paragraphs or flow', async () => {
    const p = await run('<div class="wrapper"><div>only text</div><div><p>para</p>tail text</div></div>');
    expect(p.neutral).toBe('<p>only text</p><p>para</p><p>tail text</p>');
    expect(p.original).toBe('<p>only text</p><p>para</p><p>tail text</p>');
  });

  it('keeps our own sg- classes in both variants', async () => {
    const p = await run('<p><img src="https://cdn.example/x.png" alt="Remote"></p><iframe src="https://a.example/e"></iframe>');
    for (const html of [p.original, p.neutral]) {
      expect(html).toContain('<span class="sg-missing-image">Image not available: Remote</span>');
      expect(html).toContain('<p class="sg-embed">Embedded content: <a href="https://a.example/e">a.example</a></p>');
    }
  });

  it('returns empty strings and no findings for content with no body', async () => {
    const p = await run('', {}, { kind: 'file', title: 'A file' });
    expect(p.original).toBe('');
    expect(p.neutral).toBe('');
    expect(p.report).toEqual([]);
    expect(p.notices).toEqual([]);
    expect(p.assetBytes).toBe(0);
    expect(p.kind).toBe('file');
    expect(p.title).toBe('A file');
  });

  it('flags an "other" kind as title-only so an empty section is explained', async () => {
    const p = await run('', {}, { kind: 'other', title: 'ICS123ch01' });
    expect(p.original).toBe('');
    expect(p.neutral).toBe('');
    expect(p.report.map((e) => [e.code, e.severity, e.detail])).toEqual([['title-only', 'info', 'ICS123ch01']]);
    expect(p.notices).toEqual([]);
  });

  it('unwraps a full <html><head><body> document when handed one', async () => {
    const p = await run(
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><title>T</title><meta name="identifier" content="g1"/></head><body><p>Body only</p></body></html>',
    );
    expect(p.neutral).toBe('<p>Body only</p>');
  });
});
