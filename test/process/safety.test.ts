import { describe, expect, it } from 'vitest';
import { assertSafe } from '../../src/lib/process';
import { codes, entry, run } from './helpers';

const NASTY = `
<p onclick="alert(1)">Hello <a href="javascript:alert(1)">bad link</a> <a href="  JaVaScRiPt:alert(2)">bad 2</a></p>
<script>alert('x')</script>
<svg onload="alert(1)"><script>alert(2)</script><text>svg text</text></svg>
<math><mi>x</mi><script>alert(3)</script></math>
<iframe srcdoc="<script>alert(4)</script>"></iframe>
<meta http-equiv="refresh" content="0;url=https://evil.example">
<base href="https://evil.example/">
<noscript><p>noscript</p></noscript>
<img src="x" onerror="alert(5)" alt="pic">
<a href="vbscript:msgbox(1)">vb</a>
<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">data html</a>
<form action="https://evil.example/post"><input type="text" name="q"><button>Send</button><p>inside form</p></form>
<object data="javascript:alert(6)"><p>fallback</p></object>
<embed src="x.swf">
<style>body { background: url(https://evil.example/t.png) }</style>
<link rel="stylesheet" href="https://evil.example/x.css">
<p style="background: url(https://evil.example/track.png); color: red">styled</p>
<p><span style="behavior: url(x.htc); font-weight: bold">bh</span></p>
<h2>Real heading</h2>
`;

describe('safety strip (§6b)', () => {
  it('removes every JavaScript vector from both variants', async () => {
    const p = await run(NASTY);
    for (const html of [p.original, p.neutral]) {
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html).not.toMatch(/javascript:/i);
      expect(html).not.toMatch(/vbscript:/i);
      expect(html).not.toMatch(/data:text\/html/i);
      expect(html).not.toMatch(/<(iframe|object|embed|applet|form|input|button|style|link|meta|base|noscript|svg)\b/i);
      expect(html).not.toMatch(/srcdoc|url\(|behavior/i);
      expect(html).not.toMatch(/evil\.example/);
      expect(() => assertSafe(html)).not.toThrow();
    }
    // text survives, MathML survives
    expect(p.neutral).toContain('Hello');
    expect(p.neutral).toContain('inside form');
    expect(p.neutral).toContain('fallback');
    expect(p.neutral).toContain('<math>');
    expect(p.neutral).toContain('<mi>x</mi>');
    expect(p.neutral).not.toContain('svg text');
    expect(p.neutral).not.toContain('noscript');
    // the styled paragraph keeps its safe declaration only, in Original
    expect(p.original).toContain('style="color: red"');
    expect(p.original).toContain('style="font-weight: bold"');
    expect(entry(p, 'script-removed')).toBeDefined();
    expect(codes(p, 'info')).toContain('interactive-stripped');
    expect(p.notices).toContain('interactive-removed');
  });

  it('assertSafe throws on unsafe markup', () => {
    expect(() => assertSafe('<p>ok</p>')).not.toThrow();
    expect(() => assertSafe('<p><script>1</script></p>')).toThrow();
    expect(() => assertSafe('<p onclick="x">a</p>')).toThrow();
    expect(() => assertSafe('<a href="javascript:x">a</a>')).toThrow();
    expect(() => assertSafe('<iframe src="https://a.example"></iframe>')).toThrow();
  });

  it('replaces http(s) iframes with an embed note and link', async () => {
    const p = await run(
      '<p>Watch:</p><div><iframe title="YouTube video player" src="https://www.youtube.com/embed/_Wf2rbL9wQU?si=abc" width="560" height="315" allowfullscreen></iframe></div>' +
        '<p>Then <iframe src="https://www.youtube.com/embed/xk4_1vDrzzo?start=5908&amp;end=6294&amp;si=zzz"></iframe></p>' +
        '<p>Short <iframe src="https://youtu.be/abcdefghijk?t=42"></iframe></p>' +
        '<p><iframe src="https://community.instructuremedia.com/embed/4cd5e9eb"></iframe></p>' +
        '<p><object data="https://tool.example/launch"></object></p>',
    );
    expect(p.neutral).toContain('<p class="sg-embed">Embedded content: <a href="https://www.youtube.com/watch?v=_Wf2rbL9wQU">www.youtube.com</a></p>');
    expect(p.neutral).toContain('<a href="https://www.youtube.com/watch?v=xk4_1vDrzzo&amp;t=5908">www.youtube.com</a>');
    expect(p.neutral).toContain('<a href="https://www.youtube.com/watch?v=abcdefghijk&amp;t=42">www.youtube.com</a>');
    expect(p.neutral).toContain('<a href="https://community.instructuremedia.com/embed/4cd5e9eb">community.instructuremedia.com</a>');
    expect(p.neutral).toContain('<a href="https://tool.example/launch">tool.example</a>');
    expect(p.neutral).not.toMatch(/<iframe|<object/);
    // no <p> nested in <p>: the note that sat inside "Then" moved after it
    expect(p.neutral).not.toMatch(/<p[^>]*>[^<]*<p/);
    expect(p.notices).toContain('interactive-removed');
    const e = entry(p, 'interactive-removed');
    expect(e?.severity).toBe('info');
    expect(e?.count).toBe(5);
  });

  it('replaces video and audio with a media note', async () => {
    const p = await run(
      '<p>Intro</p><video title="Course welcome" src="welcome.mp4" controls></video><audio><source src="media/lecture%201.mp3"></audio>',
    );
    expect(p.neutral).toContain('<p class="sg-media">Media omitted: Course welcome</p>');
    expect(p.neutral).toContain('<p class="sg-media">Media omitted: lecture 1.mp3</p>');
    expect(p.neutral).not.toMatch(/<video|<audio|<source/);
    expect(p.notices).toContain('media-omitted');
    expect(entry(p, 'media-omitted')?.count).toBe(2);
  });

  it('drops data-*, loading, aria-* and hidden content', async () => {
    const p = await run(
      '<p><i class="fas fa-book" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i> After completing</p>' +
        '<p hidden>secret</p><img src="a.png" alt="A" data-api-endpoint="https://x.instructure.com/api" loading="lazy" role="presentation">',
    );
    for (const html of [p.original, p.neutral]) {
      expect(html).not.toMatch(/data-|loading=|aria-|display: none|secret|<i>/);
    }
    expect(p.neutral).toContain('After completing');
    expect(p.neutral).toContain('alt=""');
    expect(p.neutral).not.toContain('role=');
    expect(entry(p, 'hidden-content-removed')?.count).toBe(2);
  });

  it('raises the interactive notice for a page whose only interactive content is script', async () => {
    const p = await run('<p>Hello</p><script>alert(1)</script><p onclick="x()">Hi</p>');
    expect(p.neutral).toBe('<p>Hello</p><p>Hi</p>');
    expect(entry(p, 'script-removed')?.count).toBe(2);
    expect(p.notices).toContain('interactive-removed');
  });

  it('drops inline-style declarations that could fetch a remote resource, keeping the safe ones', async () => {
    const p = await run(
      '<p style="background: image-set(\'https://evil.example/t.png\' 1x); color: red">a</p>' +
        '<p style="background-image: -webkit-image-set(url(https://evil.example/t.png) 1x)">b</p>' +
        '<p style="color: rgb(0, 55, 100); margin: calc(1em + 2px)">c</p>',
    );
    expect(p.original).toBe('<p style="color: red">a</p><p>b</p><p style="color: rgb(0, 55, 100); margin: calc(1em + 2px)">c</p>');
    expect(p.original).not.toMatch(/evil\.example|image-set|url\(/);
    expect(() => assertSafe(p.original)).not.toThrow();
  });

  it('removes inline SVG and says so in the report', async () => {
    const p = await run('<p>Diagram:</p><svg width="100" height="100"><circle cx="50" cy="50" r="40"/></svg><p>after</p>');
    expect(p.neutral).toBe('<p>Diagram:</p><p>after</p>');
    const e = entry(p, 'inline-svg-removed');
    expect(e?.severity).toBe('info');
    expect(e?.count).toBe(1);
  });

  it('keeps MathML and strips scripts inside it', async () => {
    const p = await run('<p>Let <math><mrow><mi>x</mi><mo>=</mo><mn>2</mn></mrow><script>alert(1)</script></math> hold.</p>');
    expect(p.neutral).toContain('<math><mrow><mi>x</mi><mo>=</mo><mn>2</mn></mrow></math>');
    expect(p.neutral).not.toMatch(/script/);
  });
});
