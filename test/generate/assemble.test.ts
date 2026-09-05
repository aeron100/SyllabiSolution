import { describe, it, expect } from 'vitest';
import { assembleDocument } from '../../src/lib/generate';
import { DEFAULT_PALETTE, PALETTES } from '../../src/lib/generate/colors';
import type { ProcessedPage } from '../../src/lib/types';
import { PNG_1PX, PRESENTATIONS, count, everyKindPages, makeDoc, page, parse } from './helpers';

const NO_SCRIPT = (html: string) => {
  expect(html.toLowerCase()).not.toContain('<script');
  expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  expect(html).not.toMatch(/["']on[a-z]+\s*=/i);
  expect(html.toLowerCase()).not.toContain('javascript:');
  expect(html.toLowerCase()).not.toContain('vbscript:');
};

const COVER_OPEN = '<header class="sg-cover">\n<div class="sg-cover-inner">';
const MASTHEAD_OPEN = '<header class="sg-cover sg-cover-min">\n<div class="sg-cover-inner">';
const TOC_OPEN = '<nav class="sg-toc" aria-labelledby="sg-toc-h">';
// Markup, not class names: the stylesheet mentions these selectors in every document.
const BRAND_OPEN = '<p class="sg-brand">';
const LOGO_OPEN = '<img class="sg-logo"';
const INSTITUTION_OPEN = '<span class="sg-institution">';

describe.each(PRESENTATIONS)('assembleDocument (%s)', (presentation) => {
  const doc = makeDoc(presentation);
  const out = assembleDocument(doc);
  const html = out.html;

  it('contains no script, no event-handler attributes, no script URLs', () => {
    NO_SCRIPT(html);
  });

  it('has exactly one h1', () => {
    expect(count(html, /<h1[\s>]/g)).toBe(1);
  });

  it('starts with a doctype and sets the lang attribute', () => {
    expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('<title>Fundamentals of Data Structures – Syllabus</title>');
  });

  it('has a skip link, a cover, a contents nav and a main landmark in order', () => {
    const skip = html.indexOf('<a class="sg-skip" href="#sg-main">Skip to content</a>');
    const cover = html.indexOf(COVER_OPEN);
    const toc = html.indexOf(TOC_OPEN);
    const main = html.indexOf('<main id="sg-main">');
    expect(skip).toBeGreaterThan(0);
    expect(cover).toBeGreaterThan(skip);
    expect(toc).toBeGreaterThan(cover);
    expect(main).toBeGreaterThan(toc);
    expect(html).toContain('<h2 id="sg-toc-h">Contents</h2>');
  });

  it('emits one section per page with the right id, kind class and h2', () => {
    expect(count(html, /<section[\s>]/g)).toBe(doc.sections.length);
    // sec-a and sec-b have unique titles: regions named by their heading
    expect(html).toContain('<section id="sec-a" class="sg-section sg-kind-syllabus" aria-labelledby="sec-a-title">');
    expect(html).toContain('<section id="sec-b" class="sg-section sg-kind-page" aria-labelledby="sec-b-title">');
    for (const s of doc.sections) {
      expect(html).toContain(`<h2 id="${s.sectionId}-title">${s.title}</h2>`);
    }
  });

  it('toc links match section ids and duplicate titles are disambiguated', () => {
    expect(html).toContain('<li><a href="#sec-a">Course Overview</a></li>');
    expect(html).toContain('<li><a href="#sec-b">Week 1</a></li>');
    expect(html).toContain('<li><a href="#sec-c">Week 1 (2)</a></li>');
    // The section heading itself keeps the plain title.
    expect(html).toContain('<h2 id="sec-c-title">Week 1</h2>');
    expect(html).not.toContain('<h2 id="sec-c-title">Week 1 (2)</h2>');
  });

  it('names a duplicate-title region with its contents-list label so every landmark name is unique', () => {
    expect(html).toContain('<section id="sec-c" class="sg-section sg-kind-assignment" aria-label="Week 1 (2)">');
    expect(html).not.toContain('aria-labelledby="sec-c-title"');
    const d = parse(html);
    const names = Array.from(d.querySelectorAll('main > section')).map((s) => {
      const by = s.getAttribute('aria-labelledby');
      return by ? (d.getElementById(by)?.textContent ?? '') : (s.getAttribute('aria-label') ?? '');
    });
    expect(names).toEqual(['Course Overview', 'Week 1', 'Week 1 (2)']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses the original variant for Original and the neutral variant for Styled', () => {
    if (presentation === 'original') {
      expect(html).toContain('Original Course Overview');
      expect(html).not.toContain('Neutral Course Overview');
    } else {
      expect(html).toContain('Neutral Course Overview');
      expect(html).not.toContain('Original Course Overview');
    }
  });

  it('escapes cover fields', () => {
    expect(html).toContain('<p class="sg-instructor">&lt;b&gt;x&lt;/b&gt;</p>');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('<p class="sg-code">ICS 123</p>');
    expect(html).toContain('<p class="sg-term">Fall 2026</p>');
    expect(html).toContain('<dt>Email</dt><dd><a href="mailto:prof@example.edu">prof@example.edu</a></dd>');
    expect(html).toContain('<dt>Office hours</dt><dd>Mon 2–4<br>Wed 1–3</dd>');
    expect(html).toContain('<dt>Meeting times</dt><dd>TTh 9:00–10:15</dd>');
  });

  it('has no institution line or logo unless provided', () => {
    expect(html).not.toContain(BRAND_OPEN);
    expect(html).not.toContain(LOGO_OPEN);
    expect(html).not.toContain(INSTITUTION_OPEN);
  });

  it('has no stamp unless one is set', () => {
    expect(html).not.toContain('<footer class="sg-stamp">');
  });

  it('is deterministic: two calls give identical output', () => {
    const again = assembleDocument(makeDoc(presentation));
    expect(again.html).toBe(html);
    expect(again).toEqual(out);
  });

  it('reports bytes as the UTF-8 length of the html', () => {
    expect(out.bytes).toBe(new TextEncoder().encode(html).length);
  });

  it('marks the body with the presentation, no break class by default, and the palette only for Styled', () => {
    if (presentation === 'original') {
      expect(html).toContain('<body class="sg sg-original">');
      expect(html).not.toContain('data-palette');
    } else {
      expect(html).toContain(`<body class="sg sg-styled" data-palette="${DEFAULT_PALETTE}">`);
    }
  });

  it('parses in jsdom with zero script elements and consistent references', () => {
    const d = parse(html);
    expect(d.querySelectorAll('script').length).toBe(0);
    expect(d.querySelectorAll('h1').length).toBe(1);
    expect(d.documentElement.getAttribute('lang')).toBe('en');
    expect(d.title).toBe('Fundamentals of Data Structures – Syllabus');
    expect(d.querySelectorAll('main#sg-main').length).toBe(1);
    expect(d.querySelectorAll('style').length).toBe(1);
    expect(d.querySelector('nav.sg-toc')?.getAttribute('aria-labelledby')).toBe('sg-toc-h');
    expect(d.getElementById('sg-toc-h')?.textContent).toBe('Contents');

    // header (with the h1) → nav → main, in document order
    const header = d.querySelector('body > header.sg-cover')!;
    const nav = d.querySelector('body > nav.sg-toc')!;
    const main = d.querySelector('body > main')!;
    expect(header.querySelector('h1')).not.toBeNull();
    expect(header.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nav.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const sections = Array.from(d.querySelectorAll('main > section'));
    expect(sections.length).toBe(3);
    for (const s of sections) {
      // every section has a name: its own h2, or an explicit label for a repeated title
      const labelledBy = s.getAttribute('aria-labelledby');
      if (labelledBy) {
        const h2 = d.getElementById(labelledBy);
        expect(h2?.tagName).toBe('H2');
        expect(h2?.parentElement).toBe(s);
        expect(s.hasAttribute('aria-label')).toBe(false);
      } else {
        expect(s.getAttribute('aria-label')).toBeTruthy();
      }
      expect(s.querySelector(':scope > h2')?.id).toBe(`${s.id}-title`);
    }
    const links = Array.from(d.querySelectorAll('nav.sg-toc a'));
    expect(links.length).toBe(3);
    for (const a of links) {
      const target = (a.getAttribute('href') ?? '').slice(1);
      expect(d.getElementById(target)?.tagName).toBe('SECTION');
    }
    // every id is unique
    const ids = Array.from(d.querySelectorAll('[id]')).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // no inline event handlers survive parsing either
    for (const el of Array.from(d.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.toLowerCase().startsWith('on')).toBe(false);
      }
    }
  });
});

describe.each(PALETTES)('every palette: $name ($id)', (p) => {
  const out = assembleDocument(makeDoc('styled', { palette: p.id }, {}, everyKindPages()));
  const html = out.html;

  it('is script-free with one h1 and a section per kind', () => {
    NO_SCRIPT(html);
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(count(html, /<section[\s>]/g)).toBe(everyKindPages().length);
  });

  it('records the palette on the body and inlines its primary and accent', () => {
    expect(html).toContain(`<body class="sg sg-styled" data-palette="${p.id}">`);
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(css).toContain(`--sg-primary: ${p.primary};`);
    expect(css).toContain(`--sg-accent: ${p.accent};`);
    expect(css).toContain(`(${p.id})`);
  });

  it('is deterministic', () => {
    expect(assembleDocument(makeDoc('styled', { palette: p.id }, {}, everyKindPages())).html).toBe(html);
  });
});

describe('document options', () => {
  it('showCover=false still yields exactly one h1, in a slim masthead ahead of the contents nav', () => {
    const html = assembleDocument(makeDoc('styled', { showCover: false })).html;
    expect(html).not.toContain(COVER_OPEN);
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain(`${MASTHEAD_OPEN}\n<h1 class="sg-title">Fundamentals of Data Structures</h1>\n</div>\n</header>`);
    expect(html.indexOf(MASTHEAD_OPEN)).toBeLessThan(html.indexOf(TOC_OPEN));
    expect(html.indexOf(TOC_OPEN)).toBeLessThan(html.indexOf('<main id="sg-main">'));
    expect(html).not.toContain('ICS 123');
    expect(html).not.toContain('&lt;b&gt;x&lt;/b&gt;');
    // the first heading in the document is the h1, not "Contents"
    const d = parse(html);
    expect(d.querySelector('h1, h2, h3, h4, h5, h6')?.tagName).toBe('H1');
  });

  it('showToc=false omits the nav', () => {
    const html = assembleDocument(makeDoc('styled', { showToc: false })).html;
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('sg-toc-h');
  });

  it('pageBreaks toggles the body class', () => {
    expect(assembleDocument(makeDoc('styled', { pageBreaks: true })).html).toContain(
      `<body class="sg sg-styled sg-breaks" data-palette="${DEFAULT_PALETTE}">`,
    );
    expect(assembleDocument(makeDoc('styled', { pageBreaks: false })).html).toContain(
      `<body class="sg sg-styled" data-palette="${DEFAULT_PALETTE}">`,
    );
    expect(assembleDocument(makeDoc('original', { pageBreaks: true })).html).toContain('<body class="sg sg-original sg-breaks">');
  });

  it('an unknown palette id falls back to the default and records the resolved id', () => {
    const html = assembleDocument(makeDoc('styled', { palette: 'no-such-palette' as never })).html;
    expect(html).toContain(`data-palette="${DEFAULT_PALETTE}"`);
    expect(html).toBe(assembleDocument(makeDoc('styled')).html);
  });

  it('original ignores the palette entirely', () => {
    const a = assembleDocument(makeDoc('original', { palette: 'plum-blush' })).html;
    const b = assembleDocument(makeDoc('original', { palette: 'ink-paper' })).html;
    expect(a).toBe(b);
    expect(a).not.toContain('--sg-primary');
  });

  it('stamp appears only when set, escaped, in a footer after main', () => {
    const html = assembleDocument(makeDoc('styled', { stamp: 'Generated 2026-09-02 <test>' })).html;
    expect(html).toContain('</main>\n<footer class="sg-stamp"><p>Generated 2026-09-02 &lt;test&gt;</p></footer>');
    const none = assembleDocument(makeDoc('styled', { stamp: '   ' })).html;
    expect(none).not.toContain('<footer');
  });

  it('only fields present on the cover are rendered', () => {
    const html = assembleDocument(
      makeDoc('styled', {}, { courseCode: undefined, term: '', instructor: '  ', email: undefined, officeHours: undefined, meetingTimes: undefined }),
    ).html;
    expect(html).not.toContain('<p class="sg-code">');
    expect(html).not.toContain('<p class="sg-term">');
    expect(html).not.toContain('<dl');
    expect(html).not.toContain('<dt>');
    expect(html).toContain(`${COVER_OPEN}\n<h1 class="sg-title">Fundamentals of Data Structures</h1>\n</div>\n</header>`);
  });

  it('links the email only when it looks like an address', () => {
    const good = assembleDocument(makeDoc('styled', {}, { email: 'a.b+c@uni.edu' })).html;
    expect(good).toContain('<a href="mailto:a.b+c@uni.edu">a.b+c@uni.edu</a>');
    const bad = assembleDocument(makeDoc('styled', {}, { email: 'ask me "in class"' })).html;
    expect(bad).not.toContain('mailto:');
    expect(bad).toContain('<dt>Email</dt><dd>ask me &quot;in class&quot;</dd>');
  });

  it('accepts region subtags and falls back to "en" for a bad language tag', () => {
    expect(assembleDocument(makeDoc('styled', { language: 'pt-BR' })).html).toContain('<html lang="pt-BR">');
    expect(assembleDocument(makeDoc('styled', { language: '"><x' })).html).toContain('<html lang="en">');
    expect(assembleDocument(makeDoc('styled', { language: '' })).html).toContain('<html lang="en">');
  });

  it('falls back to "Syllabus" when the course title is empty', () => {
    const html = assembleDocument(makeDoc('styled', {}, { courseTitle: '   ' })).html;
    expect(html).toContain('<title>Syllabus</title>');
    expect(html).toContain('<h1 class="sg-title">Syllabus</h1>');
  });

  it('escapes the course title in <title> and <h1>', () => {
    const html = assembleDocument(makeDoc('styled', {}, { courseTitle: 'A & B <i>C</i>' })).html;
    expect(html).toContain('<title>A &amp; B &lt;i&gt;C&lt;/i&gt; – Syllabus</title>');
    expect(html).toContain('<h1 class="sg-title">A &amp; B &lt;i&gt;C&lt;/i&gt;</h1>');
    expect(html).not.toContain('<i>C</i>');
  });

  it('handles an empty selection: one h1 in the masthead, no nav, empty main', () => {
    const out = assembleDocument(makeDoc('styled', { showCover: false }, {}, []));
    expect(count(out.html, /<h1[\s>]/g)).toBe(1);
    expect(out.html).not.toContain('<nav');
    expect(out.html).toContain(`${MASTHEAD_OPEN}\n<h1 class="sg-title">Fundamentals of Data Structures</h1>\n</div>\n</header>\n<main id="sg-main">\n</main>`);
    expect(out.report).toEqual({ fixed: [], todo: [], info: [] });
    expect(out.notices).toEqual([]);
  });
});

describe('cover institution and logo', () => {
  it.each(PRESENTATIONS)('renders the logo with the institution as its alt text, escaped, ahead of the h1 (%s)', (presentation) => {
    const html = assembleDocument(
      makeDoc(presentation, {}, { institution: 'Coastline <College> & Co', logoDataUri: PNG_1PX }),
    ).html;
    expect(html).toContain(
      `${COVER_OPEN}\n${BRAND_OPEN}<img class="sg-logo" src="${PNG_1PX}" alt="Coastline &lt;College&gt; &amp; Co"></p>\n<h1 class="sg-title">`,
    );
    // the name is not repeated as visible text beside the image (axe image-redundant-alt)
    expect(html).not.toContain(INSTITUTION_OPEN);
    expect(html).not.toContain('<College>');
    NO_SCRIPT(html);
    const d = parse(html);
    const img = d.querySelector('header img.sg-logo')!;
    expect(img.getAttribute('alt')).toBe('Coastline <College> & Co');
    expect(img.getAttribute('src')).toBe(PNG_1PX);
    expect(d.querySelectorAll('h1').length).toBe(1);
  });

  it('institution alone gives a text line; logo alone gives an image with empty alt', () => {
    const text = assembleDocument(makeDoc('styled', {}, { institution: '  Coastline College  ' })).html;
    expect(text).toContain(`${BRAND_OPEN}${INSTITUTION_OPEN}Coastline College</span></p>`);
    expect(text).not.toContain(LOGO_OPEN);

    const logo = assembleDocument(makeDoc('styled', {}, { logoDataUri: PNG_1PX })).html;
    expect(logo).toContain(`${BRAND_OPEN}<img class="sg-logo" src="${PNG_1PX}" alt=""></p>`);
    expect(logo).not.toContain(INSTITUTION_OPEN);
  });

  it('blank values render nothing', () => {
    const html = assembleDocument(makeDoc('styled', {}, { institution: '   ', logoDataUri: '' })).html;
    expect(html).not.toContain(BRAND_OPEN);
  });

  it('refuses a logo that is not an embedded image data URI (no remote loads, no injection)', () => {
    for (const bad of [
      'https://example.org/logo.svg',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/png;base64,AAAA" onerror="alert(1)',
      'data:image/svg+xml,<svg onload="alert(1)"></svg>',
      '/coastline-logo.svg',
    ]) {
      const html = assembleDocument(makeDoc('styled', {}, { institution: 'Coastline College', logoDataUri: bad })).html;
      expect(html, bad).not.toContain(LOGO_OPEN);
      expect(html, bad).not.toContain('example.org');
      expect(html, bad).toContain(`${BRAND_OPEN}${INSTITUTION_OPEN}Coastline College</span></p>`);
      NO_SCRIPT(html);
    }
  });

  it('is omitted from the slim masthead when the cover is off', () => {
    const html = assembleDocument(makeDoc('styled', { showCover: false }, { institution: 'Coastline College', logoDataUri: PNG_1PX })).html;
    expect(html).not.toContain(BRAND_OPEN);
    expect(html).not.toContain(LOGO_OPEN);
  });
});

describe('report and notices', () => {
  const out = assembleDocument(makeDoc('styled'));

  it('aggregates section reports by severity in section order', () => {
    expect(out.report.fixed.map((e) => e.code)).toEqual(['heading-normalized', 'list-converted']);
    expect(out.report.todo.map((e) => e.code)).toEqual(['image-missing-alt']);
    expect(out.report.info.map((e) => e.code)).toEqual(['note']);
  });

  it("keeps an entry's own sectionTitle and fills in missing section fields", () => {
    const todo = out.report.todo[0]!;
    expect(todo.sectionTitle).toBe('Custom title');
    expect(todo.sectionId).toBe('sec-b');
    const fixed = out.report.fixed[0]!;
    expect(fixed.sectionId).toBe('sec-a');
    expect(fixed.sectionTitle).toBe('Course Overview');
    expect(fixed.count).toBe(2);
  });

  it('unions notices in canonical order without duplicates', () => {
    expect(out.notices).toEqual(['equations', 'media-omitted', 'missing-files']);
  });
});

describe('final guard through assembleDocument', () => {
  const hostile: ProcessedPage = page({
    sectionId: 'sec-x',
    title: 'Hostile',
    original:
      '<p>Keep <strong>this</strong>.</p>' +
      '<script>alert(1)</script>' +
      '<p onclick="alert(2)" title="ok">click</p>' +
      '<a href="javascript:alert(3)">js</a>' +
      '<a href="  JaVaScRiPt:alert(4)">js2</a>' +
      '<a href="https://example.org/">fine</a>' +
      '<iframe src="https://www.youtube.com/embed/x"></iframe>' +
      '<form action="/x"><label>Name <input name="n"></label><button>Go</button></form>' +
      '<img src="data:image/png;base64,AAAA" alt="pic" onerror="alert(5)">' +
      '<svg><script>alert(6)</script><a xlink:href="javascript:alert(7)"><text>t</text></a></svg>' +
      '<iframe srcdoc="&lt;script&gt;alert(8)&lt;/script&gt;"></iframe>' +
      '<object data="x.swf"></object><embed src="x.swf"><style>body{display:none}</style>' +
      '<math><mi>x</mi><script>alert(9)</script></math>' +
      '<a href="data:text/html,<script>alert(10)</script>">d</a>' +
      '<video src="https://evil.example/v.mp4"></video><p style="background:url(https://evil.example/x.png)">u</p>',
    neutral: '<p>neutral</p>',
  });
  hostile.neutral = hostile.original;

  it.each(PRESENTATIONS)('strips script, handlers, script URLs, embeds and remote loads (%s)', (presentation) => {
    const html = assembleDocument(makeDoc(presentation, {}, {}, [hostile])).html;
    NO_SCRIPT(html);
    expect(html).toContain('<p>Keep <strong>this</strong>.</p>');
    expect(html).toContain('<p title="ok">click</p>');
    expect(html).toContain('<a>js</a>');
    expect(html).toContain('<a>js2</a>');
    expect(html).toContain('<a href="https://example.org/">fine</a>');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');
    expect(html).toContain('Name ');
    expect(html).toContain('<img src="data:image/png;base64,AAAA" alt="pic">');
    expect(html).not.toContain('<object');
    expect(html).not.toContain('<embed');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('display:none');
    expect(html).toContain('<mi>x</mi>');
    expect(html).toContain('<a>d</a>');
    expect(html).toContain('<p>u</p>');
    const d = parse(html);
    expect(d.querySelectorAll('script, iframe, object, embed, form, input, button, style, svg, video').length).toBe(1); // our own <style>
    expect(d.querySelectorAll('body style').length).toBe(0);
  });

  it('dedupes colliding section ids deterministically', () => {
    const a = page({ sectionId: 'sec-dup', title: 'One' });
    const b = page({ sectionId: 'sec-dup', title: 'Two' });
    const c = page({ sectionId: 'sec-dup', title: 'Three' });
    const html = assembleDocument(makeDoc('styled', {}, {}, [a, b, c])).html;
    expect(html).toContain('<section id="sec-dup" ');
    expect(html).toContain('<section id="sec-dup-2" ');
    expect(html).toContain('<section id="sec-dup-3" ');
    expect(html).toContain('<a href="#sec-dup-2">Two</a>');
    const ids = Array.from(parse(html).querySelectorAll('[id]')).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never lets a section id collide with the frame ids', () => {
    const html = assembleDocument(makeDoc('styled', {}, {}, [page({ sectionId: 'sg-main', title: 'Clash' })])).html;
    expect(count(html, /id="sg-main"/g)).toBe(1);
    expect(html).toContain('<section id="sg-main-2" ');
  });

  it('escapes section titles and ids', () => {
    const html = assembleDocument(
      makeDoc('styled', {}, {}, [page({ sectionId: 'sec-"q"', title: 'Tom & <Jerry>' })]),
    ).html;
    expect(html).toContain('<h2 id="sec-&quot;q&quot;-title">Tom &amp; &lt;Jerry&gt;</h2>');
    expect(html).not.toContain('<Jerry>');
  });
});

describe('cover band: instructor name', () => {
  it('puts the instructor in the band under the title, escaped, and not in the contact list', () => {
    const html = assembleDocument(makeDoc('styled', {}, { instructor: 'Dr. <b>Ada</b> Lovelace' })).html;
    const band = html.slice(html.indexOf('<header class="sg-cover">'), html.indexOf('</header>'));
    expect(band).toContain('<p class="sg-instructor">Dr. &lt;b&gt;Ada&lt;/b&gt; Lovelace</p>');
    expect(band.indexOf('sg-instructor')).toBeGreaterThan(band.indexOf('<h1'));
    expect(band).not.toContain('<dt>Instructor</dt>');
  });
  it('omits the instructor line when the name is blank', () => {
    const html = assembleDocument(makeDoc('original', {}, { instructor: '   ' })).html;
    expect(html).not.toContain('sg-instructor">');
  });
});
