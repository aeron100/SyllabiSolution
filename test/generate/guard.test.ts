import { describe, it, expect } from 'vitest';
import { guardHtml, isScriptUrl } from '../../src/lib/generate/guard';

describe('isScriptUrl', () => {
  it('rejects javascript:, vbscript: and data:text/html in any disguise', () => {
    for (const u of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'javascript:alert(1)',
      'vbscript:MsgBox',
      'data:text/html,<b>x</b>',
      'data:text/html;base64,PGI+',
      'DATA: text/HTML,x',
      'data:text/javascript,alert(1)',
    ]) {
      expect(isScriptUrl(u), u).toBe(true);
    }
  });

  it('keeps ordinary URLs, anchors, mailto and image data URIs', () => {
    for (const u of [
      'https://example.org/',
      'http://example.org/a?b=c',
      '#sec-1',
      'mailto:a@b.co',
      'data:image/png;base64,AAAA',
      'data:image/svg+xml;base64,PHN2Zz4=',
      '/relative/path.pdf',
      '',
    ]) {
      expect(isScriptUrl(u), u).toBe(false);
    }
  });
});

describe('guardHtml', () => {
  it('leaves clean content alone (idempotent serialization)', () => {
    const clean =
      '<h3>Heading</h3><p>Text with <a href="https://example.org/">a link</a>, <strong>bold</strong> and <code>code</code>.</p>' +
      '<ul><li>one</li><li>two</li></ul>' +
      '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>' +
      '<figure><img src="data:image/png;base64,AAAA" alt="pic"><figcaption>cap</figcaption></figure>' +
      '<p class="sg-center" style="color: red;">kept</p>' +
      '<math><mi>x</mi><mo>=</mo><mn>1</mn></math>' +
      '<pre>line\n  two</pre>';
    const once = guardHtml(clean);
    expect(once).toBe(clean);
    expect(guardHtml(once)).toBe(once);
  });

  it('normalizes a leading newline in <pre> once, as the HTML parser does, then stays stable', () => {
    const once = guardHtml('<pre>\nline</pre>');
    expect(once).toBe('<pre>line</pre>');
    expect(guardHtml(once)).toBe(once);
  });

  it('removes script wherever it hides, including inside <svg> and <math>', () => {
    const html = guardHtml(
      '<p>a</p><script>1</script><svg><script>2</script><circle r="1"></circle></svg><math><script>3</script><mi>x</mi></math><SCRIPT>4</SCRIPT>',
    );
    expect(html.toLowerCase()).not.toContain('<script');
    // MathML survives (minus its script); inline SVG is not allowed at all,
    // the same rule the sanitizer applies, so it goes with its content.
    expect(html).toBe('<p>a</p><math><mi>x</mi></math>');
  });

  it('strips every on* attribute, including ones glued to a previous attribute', () => {
    const html = guardHtml('<p onclick="x()" ONMOUSEOVER=y title="t">p</p><a href="#a"onfocus="z()">a</a><img src="data:image/png;base64,A" alt="" onerror="e()">');
    expect(html).not.toMatch(/on[a-z]+\s*=/i);
    expect(html).toContain('<p title="t">p</p>');
    expect(html).toContain('<a href="#a">a</a>');
  });

  it('drops script URLs but keeps the element and its text', () => {
    const html = guardHtml(
      '<a href="javascript:void(0)">x</a><a href="  jAvAsCrIpT:1">y</a><a href="&#106;avascript:1">z</a><a href="vbscript:1">v</a><a href="https://ok.example/">ok</a>',
    );
    expect(html).toBe('<a>x</a><a>y</a><a>z</a><a>v</a><a href="https://ok.example/">ok</a>');
  });

  it('removes iframes, objects, embeds, applets, style, link, meta, base, noscript, template', () => {
    const html = guardHtml(
      '<p>keep</p><iframe src="https://x"></iframe><object data="a"></object><embed src="b"><applet code="c"></applet>' +
        '<style>p{color:red}</style><link rel="stylesheet" href="x.css"><meta http-equiv="refresh" content="0;url=x"><base href="https://x/">' +
        '<noscript><img src="https://tracker/x"></noscript><template><script>1</script></template>',
    );
    expect(html).toBe('<p>keep</p>');
  });

  it('unwraps forms and labels but removes controls', () => {
    const html = guardHtml(
      '<form action="/submit" method="post"><fieldset><legend>Quiz</legend><label>Name <input type="text" name="n"></label>' +
        '<select><option>a</option></select><textarea>t</textarea><button type="submit">Go</button><p>Thanks</p></fieldset></form>',
    );
    expect(html).toBe('QuizName <p>Thanks</p>');
  });

  it('removes inline SVG with its SMIL animation elements and xlink:href script URLs', () => {
    const html = guardHtml(
      '<p>before</p><svg><a xlink:href="javascript:alert(1)"><text>t</text></a><set attributeName="href" to="javascript:1"></set><animate attributeName="x"></animate></svg><p>after</p>',
    );
    expect(html.toLowerCase()).not.toContain('javascript:');
    expect(html).not.toContain('<set');
    expect(html).not.toContain('<animate');
    expect(html).not.toContain('<svg');
    expect(html).toBe('<p>before</p><p>after</p>');
  });

  it('is a full backstop for §6b: media, marquee, raw-text elements, canvas and portals go too', () => {
    const html = guardHtml(
      '<p>keep</p>' +
        '<video src="https://evil.example/v.mp4" autoplay><source src="https://evil.example/v.webm"><track src="https://evil.example/t.vtt"></video>' +
        '<audio src="https://evil.example/a.mp3"></audio>' +
        '<marquee>scroll</marquee>' +
        '<xmp><script>1</script></xmp><noembed><script>2</script></noembed><noframes><script>3</script></noframes>' +
        '<canvas></canvas><portal src="https://evil.example/"></portal><map name="m"><area href="https://x/"></map>' +
        '<dialog open>d</dialog>' +
        '<p>end</p><plaintext><script>4</script>',
    );
    expect(html).toBe('<p>keep</p><p>end</p>');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).not.toContain('evil.example');
  });

  it('drops srcset, target, action and srcdoc, and keeps only safe inline style declarations', () => {
    const html = guardHtml(
      '<img src="data:image/png;base64,A" srcset="https://evil.example/x.png 1x" alt="x">' +
        '<a href="https://ok.example/" target="_blank">t</a>' +
        '<p style="background:url(https://evil.example/t.png); color: red">a</p>' +
        '<p style="width: expression(alert(1))">b</p>' +
        '<div action="/x" srcdoc="&lt;script&gt;1&lt;/script&gt;">c</div>',
    );
    expect(html).toBe(
      '<img src="data:image/png;base64,A" alt="x">' +
        '<a href="https://ok.example/">t</a>' +
        '<p style="color: red">a</p>' +
        '<p>b</p>' +
        '<div>c</div>',
    );
    expect(html).not.toContain('evil.example');
  });

  it('is deterministic', () => {
    const input = '<p onclick="1">a</p><script>x</script><b>b</b>';
    expect(guardHtml(input)).toBe(guardHtml(input));
    expect(guardHtml(input)).toBe('<p>a</p><b>b</b>');
  });

  it('returns an empty string for empty input', () => {
    expect(guardHtml('')).toBe('');
  });
});
